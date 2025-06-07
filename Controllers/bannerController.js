const Banner = require('../Models/Banner');
const { deleteS3Object } = require('../config/s3');

// @desc    Create a new banner
// @route   POST /api/banners
// @access  Private/Admin
exports.createBanner = async (req, res) => {
  try {
    const { title, description, link, order } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ message: 'Banner image is required' });
    }

    const banner = new Banner({
      title,
      description,
      image: req.file.location,
      imagePath: req.file.key,
      link: link || '',
      order: order || 0
    });

    await banner.save();
    
    res.status(201).json({
      success: true,
      message: 'Banner created successfully',
      banner
    });
  } catch (error) {
    console.error('Error creating banner:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get all banners
// @route   GET /api/banners
// @access  Public
exports.getBanners = async (req, res) => {
  try {
    const banners = await Banner.find().sort({ order: 1, createdAt: -1 });
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
    const { title, description, link, isActive, order } = req.body;
    const updateData = { title, description, link, isActive, order };

    // If new image is uploaded
    if (req.file) {
      updateData.image = req.file.location;
      updateData.imagePath = req.file.key;
    }

    const banner = await Banner.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!banner) {
      return res.status(404).json({ message: 'Banner not found' });
    }

    res.json({
      success: true,
      message: 'Banner updated successfully',
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
      return res.status(404).json({ message: 'Banner not found' });
    }

    // Delete the image from S3
    await deleteS3Object(banner.imagePath);
    
    // Delete from database using findByIdAndDelete
    await Banner.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Banner deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting banner:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get active banners for hero section
// @route   GET /api/banners/active
// @access  Public
exports.getActiveBanners = async (req, res) => {
  try {
    const banners = await Banner.find({ isActive: true })
      .sort({ order: 1, createdAt: -1 })
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