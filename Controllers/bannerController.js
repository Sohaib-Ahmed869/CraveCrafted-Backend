const Banner = require('../Models/Banner');
const { deleteS3Object } = require('../config/s3');

// @desc    Create a new banner
// @route   POST /api/banners
// @access  Private/Admin
exports.createBanner = async (req, res) => {
  try {
    console.log('Request files:', req.files);
    console.log('Request file:', req.file);
    console.log('Request body:', req.body);
    
    if (!req.file) {
      console.error('No file uploaded');
      return res.status(400).json({ 
        success: false,
        message: 'Banner image is required' 
      });
    }

    console.log('Uploaded file info:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      location: req.file.location,
      key: req.file.key
    });

    const banner = new Banner({
      image: req.file.location,
      imagePath: req.file.key
    });

    console.log('Creating banner with data:', banner);
    const savedBanner = await banner.save();
    console.log('Banner created successfully:', savedBanner);
    
    res.status(201).json({
      success: true,
      message: 'Banner created successfully',
      banner: savedBanner
    });
  } catch (error) {
    console.error('Error creating banner:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      name: error.name,
      errors: error.errors
    });
    res.status(500).json({
      success: false,
      message: 'Server error during banner creation',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// @desc    Get all banners
// @route   GET /api/banners
// @access  Public
exports.getBanners = async (req, res) => {
  try {
    const banners = await Banner.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      count: banners.length,
      data: banners
    });
  } catch (error) {
    console.error('Error getting banners:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Update banner
// @route   PUT /api/banners/:id
// @access  Private/Admin
exports.updateBanner = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        message: 'No image file provided for update' 
      });
    }

    const banner = await Banner.findByIdAndUpdate(
      req.params.id,
      { 
        $set: {
          image: req.file.location,
          imagePath: req.file.key
        } 
      },
      { new: true, runValidators: true }
    );

    if (!banner) {
      return res.status(404).json({ 
        success: false,
        message: 'Banner not found' 
      });
    }

    res.json({
      success: true,
      message: 'Banner image updated successfully',
      data: banner
    });
  } catch (error) {
    console.error('Error updating banner:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Delete banner
// @route   DELETE /api/banners/:id
// @access  Private/Admin
exports.deleteBanner = async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);
    
    if (!banner) {
      return res.status(404).json({ 
        success: false,
        message: 'Banner not found' 
      });
    }

    // Delete the image from S3
    try {
      await deleteS3Object(banner.imagePath);
    } catch (s3Error) {
      console.error('Error deleting from S3:', s3Error);
      // Continue with database deletion even if S3 deletion fails
    }
    
    // Delete from database
    await Banner.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Banner deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting banner:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete banner',
      error: error.message
    });
  }
};

// @desc    Get active banners for hero section
// @route   GET /api/banners/active
// @access  Public
exports.getActiveBanners = async (req, res) => {
  try {
    const banners = await Banner.find()
      .sort({ createdAt: -1 })
      .select('-imagePath -__v -createdAt -updatedAt');
      
    res.json({
      success: true,
      count: banners.length,
      data: banners
    });
  } catch (error) {
    console.error('Error getting active banners:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
}; 