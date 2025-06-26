const Product = require('../Models/Product');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');
const Review = require('../Models/Review');

// Configure S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Configure multer for S3 upload
const upload = multer({
  storage: multerS3({
    s3: s3Client,
    bucket: process.env.AWS_S3_BUCKET || 'cravecrafted-products',
    acl: 'public-read',
    metadata: (req, file, cb) => {
      cb(null, { fieldName: file.fieldname });
    },
    key: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, `products/${uniqueSuffix}-${file.originalname}`);
    }
  }),
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG and WebP are allowed.'));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Get all products
const getAllProducts = async (req, res) => {
  try {
    const { category, status, search } = req.query;
    
    // Build filter object
    const filter = {};
    if (category) filter.category = category;
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Get all products
    const products = await Product.find(filter)
      .sort({ createdAt: -1 });

    // Get review stats for all products in one aggregation
    const productIds = products.map(p => p._id);
    const reviewStatsArr = await Review.aggregate([
      { $match: { productId: { $in: productIds } } },
      {
        $group: {
          _id: '$productId',
          averageRating: { $avg: '$stars' },
          totalReviews: { $sum: 1 }
        }
      }
    ]);
    // Convert to map for easy lookup
    const reviewStatsMap = {};
    reviewStatsArr.forEach(stat => {
      reviewStatsMap[stat._id.toString()] = {
        averageRating: parseFloat((stat.averageRating || 0).toFixed(1)),
        totalReviews: stat.totalReviews || 0
      };
    });

    // Attach review stats to each product
    const productsWithReviews = products.map(product => {
      const stats = reviewStatsMap[product._id.toString()] || { averageRating: 0, totalReviews: 0 };
      return {
        ...product.toObject(),
        reviewStats: stats
      };
    });

    res.status(200).json({
      success: true,
      message: 'Products retrieved successfully',
      data: { products: productsWithReviews }
    });

  } catch (error) {
    console.error('Get all products error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Create new product
const createProduct = async (req, res) => {
  try {
    const { title, description, price, stock, tagline, ingredients, category, featured } = req.body;
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Product image is required'
      });
    }

    // Validate required fields
    if (!title || !description || !price || !category) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields: title, description, price, and category'
      });
    }

    // Handle ingredients - convert to array if it's a string, otherwise use empty array
    const ingredientsArray = typeof ingredients === 'string' 
      ? ingredients.split(',').map(ing => ing.trim()).filter(ing => ing)
      : [];

    // Validate ingredients array is not empty
    if (ingredientsArray.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one ingredient is required'
      });
    }

    // Convert featured to boolean
    const isFeatured = featured === 'true' || featured === true;

    const product = new Product({
      title,
      description,
      price,
      stock,
      image: req.file.key,
      imageUrl: req.file.location,
      tagline,
      ingredients: ingredientsArray,
      category,
      featured: isFeatured
    });

    await product.save();

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: { product }
    });

  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update product
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    
    if (req.file) {
      updateData.image = req.file.key;
      updateData.imageUrl = req.file.location;
    }
    
    if (updateData.ingredients) {
      updateData.ingredients = updateData.ingredients.split(',').map(ing => ing.trim());
    }

    const product = await Product.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: { product }
    });

  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Delete product
const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    
    const product = await Product.findById(id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Delete image from S3
    const imageKey = product.image.split('/').pop();
    await s3Client.send(new DeleteObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET || 'cravecrafted-products',
      Key: `products/${imageKey}`
    }));

    // Delete product from database
    await Product.deleteOne({ _id: id });

    res.status(200).json({
      success: true,
      message: 'Product deleted successfully'
    });

  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get single product
const getProduct = async (req, res) => {
  try {
    const { id } = req.params;
    
    const product = await Product.findById(id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Fetch real-time reviews for this product
    const reviews = await Review.find({ productId: id })
      .populate('userId', 'name')
      .sort({ createdAt: -1 });

    // Get average rating and total reviews
    const stats = await Review.getAverageRating(id);

    res.status(200).json({
      success: true,
      message: 'Product retrieved successfully',
      data: {
        product,
        reviews,
        reviewStats: {
          averageRating: parseFloat(stats.averageRating?.toFixed(1)) || 0,
          totalReviews: stats.totalReviews || 0
        }
      }
    });

  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get featured products
const getFeaturedProducts = async (req, res) => {
  try {
    const featuredProducts = await Product.find({ featured: true })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: 'Featured products retrieved successfully',
      data: { products: featuredProducts }
    });

  } catch (error) {
    console.error('Get featured products error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get total products count
const getTotalProductsCount = async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments();
    
    res.status(200).json({
      success: true,
      message: 'Total products count retrieved successfully',
      data: {
        totalProducts
      }
    });

  } catch (error) {
    console.error('Get total products count error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  upload,
  getAllProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getProduct,
  getFeaturedProducts,
  getTotalProductsCount
}; 