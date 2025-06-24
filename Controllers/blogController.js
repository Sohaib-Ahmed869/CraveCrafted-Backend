const Blog = require('../Models/Blog');
const BlogView = require('../Models/BlogView');

// Get all blogs
exports.getAllBlogs = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status,
      search,
      hashtag 
    } = req.query;

    // Build query
    let query = {};
    
    // Only filter by status if it's provided and not empty
    if (status && status.trim() !== '') {
      query.status = status;
    }
    
    if (search) {
      query.$or = [
        { content: { $regex: search, $options: 'i' } },
        { authorName: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (hashtag) {
      query.hashtags = { $in: [hashtag] };
    }

    const blogs = await Blog.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('comments.user', 'name')
      .exec();

    const totalBlogs = await Blog.countDocuments(query);
    const totalPages = Math.ceil(totalBlogs / limit);

    res.status(200).json({
      success: true,
      data: blogs,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalBlogs,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching blogs',
      error: error.message
    });
  }
};

// Get single blog by ID or slug
exports.getBlog = async (req, res) => {
  try {
    const { id } = req.params;
    let blog;

    // Try to find by ID first, then by slug
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      blog = await Blog.findById(id).populate('comments.user', 'name');
    } else {
      blog = await Blog.findOne({ slug: id }).populate('comments.user', 'name');
    }

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found'
      });
    }

    // Don't increment views here - use separate endpoint for that
    res.status(200).json({
      success: true,
      data: blog
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching blog',
      error: error.message
    });
  }
};

// Increment blog views with tracking
exports.incrementViews = async (req, res) => {
  try {
    const { id } = req.params;
    const clientIP = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
    const userAgent = req.headers['user-agent'];
    
    // Find the blog
    let blog;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      blog = await Blog.findById(id);
    } else {
      blog = await Blog.findOne({ slug: id });
    }

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found'
      });
    }

    // Check if this IP has already viewed this blog recently (within 24 hours)
    const viewKey = `blog_${blog._id}_${clientIP}`;
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // For now, we'll use a simple approach with session storage
    // In production, you might want to use Redis or a separate collection
    const existingView = await BlogView.findOne({
      blogId: blog._id,
      clientIP: clientIP,
      viewedAt: { $gte: oneDayAgo }
    });

    if (!existingView) {
      // Increment the view count
      blog.views += 1;
      await blog.save();

      // Record this view for tracking
      await BlogView.create({
        blogId: blog._id,
        clientIP: clientIP,
        userAgent: userAgent,
        viewedAt: now
      });

      console.log(`View incremented for blog ${blog._id} from IP ${clientIP}`);
    } else {
      console.log(`View already recorded for blog ${blog._id} from IP ${clientIP} within 24 hours`);
    }

    res.status(200).json({
      success: true,
      message: 'View tracked successfully',
      data: {
        blogId: blog._id,
        views: blog.views,
        newView: !existingView
      }
    });
  } catch (error) {
    console.error('Error incrementing views:', error);
    res.status(500).json({
      success: false,
      message: 'Error tracking view',
      error: error.message
    });
  }
};

// Create new blog
exports.createBlog = async (req, res) => {
  try {
    const { content, hashtags, authorName, date, status } = req.body;

    // Validate required fields
    if (!content || content.trim() === '' || content === '<p><br></p>') {
      return res.status(400).json({
        success: false,
        message: 'Content is required'
      });
    }

    if (!authorName || authorName.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Author name is required'
      });
    }

    // Process hashtags
    let processedHashtags = [];
    if (hashtags) {
      if (Array.isArray(hashtags)) {
        processedHashtags = hashtags;
      } else if (typeof hashtags === 'string') {
        processedHashtags = hashtags.split(',').map(tag => tag.trim()).filter(tag => tag);
      }
    }

    const blog = await Blog.create({
      content: content.trim(),
      hashtags: processedHashtags,
      authorName: authorName.trim(),
      date: date ? new Date(date) : new Date(),
      status: status || 'published'
    });

    res.status(201).json({
      success: true,
      message: 'Blog created successfully',
      data: blog
    });
  } catch (error) {
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error creating blog',
      error: error.message
    });
  }
};

// Update blog
exports.updateBlog = async (req, res) => {
  try {
    const { content, hashtags, authorName, date, status } = req.body;
    const { id } = req.params;

    // Find the blog first
    const existingBlog = await Blog.findById(id);
    if (!existingBlog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found'
      });
    }

    // Prepare update data
    const updateData = {};
    
    if (content !== undefined) {
      if (!content || content.trim() === '' || content === '<p><br></p>') {
        return res.status(400).json({
          success: false,
          message: 'Content cannot be empty'
        });
      }
      updateData.content = content.trim();
    }

    if (authorName !== undefined) {
      if (!authorName || authorName.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Author name cannot be empty'
        });
      }
      updateData.authorName = authorName.trim();
    }

    if (date !== undefined) {
      updateData.date = new Date(date);
    }

    if (status !== undefined) {
      updateData.status = status;
    }

    if (hashtags !== undefined) {
      let processedHashtags = [];
      if (Array.isArray(hashtags)) {
        processedHashtags = hashtags;
      } else if (typeof hashtags === 'string') {
        processedHashtags = hashtags.split(',').map(tag => tag.trim()).filter(tag => tag);
      }
      updateData.hashtags = processedHashtags;
    }

    const blog = await Blog.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Blog updated successfully',
      data: blog
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error updating blog',
      error: error.message
    });
  }
};

// Delete blog
exports.deleteBlog = async (req, res) => {
  try {
    const blog = await Blog.findByIdAndDelete(req.params.id);
    
    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Blog deleted successfully',
      data: blog
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting blog',
      error: error.message
    });
  }
};

// Get all hashtags
exports.getAllHashtags = async (req, res) => {
  try {
    const hashtags = await Blog.aggregate([
      { $unwind: '$hashtags' },
      { $group: { _id: '$hashtags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $project: { _id: 0, hashtag: '$_id', count: 1 } }
    ]);

    res.status(200).json({
      success: true,
      data: hashtags
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching hashtags',
      error: error.message
    });
  }
};

// Get blog stats
exports.getBlogStats = async (req, res) => {
  try {
    const totalBlogs = await Blog.countDocuments();
    const publishedBlogs = await Blog.countDocuments({ status: 'published' });
    const draftBlogs = await Blog.countDocuments({ status: 'draft' });
    const archivedBlogs = await Blog.countDocuments({ status: 'archived' });
    const totalViews = await Blog.aggregate([
      { $group: { _id: null, totalViews: { $sum: '$views' } } }
    ]);

    const topHashtags = await Blog.aggregate([
      { $unwind: '$hashtags' },
      { $group: { _id: '$hashtags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $project: { _id: 0, hashtag: '$_id', count: 1 } }
    ]);

    // Get most viewed blogs
    const mostViewedBlogs = await Blog.find({ status: 'published' })
      .sort({ views: -1 })
      .limit(5)
      .select('title authorName views createdAt');

    res.status(200).json({
      success: true,
      data: {
        totalBlogs,
        publishedBlogs,
        draftBlogs,
        archivedBlogs,
        totalViews: totalViews[0]?.totalViews || 0,
        topHashtags,
        mostViewedBlogs
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching blog stats',
      error: error.message
    });
  }
};

// Get view analytics for a specific blog
exports.getBlogViewAnalytics = async (req, res) => {
  try {
    const { id } = req.params;
    const { days = 30 } = req.query;

    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog not found'
      });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get view data for the specified period
    const viewData = await BlogView.aggregate([
      {
        $match: {
          blogId: blog._id,
          viewedAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$viewedAt" }
          },
          views: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Get unique visitors
    const uniqueVisitors = await BlogView.distinct('clientIP', {
      blogId: blog._id,
      viewedAt: { $gte: startDate }
    });

    res.status(200).json({
      success: true,
      data: {
        blogId: blog._id,
        totalViews: blog.views,
        viewData,
        uniqueVisitors: uniqueVisitors.length,
        period: `${days} days`
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching view analytics',
      error: error.message
    });
  }
};

// Like or unlike a blog
exports.toggleLike = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({ success: false, message: 'Blog not found' });
    }
    const index = blog.likes.indexOf(userId);
    let liked;
    if (index === -1) {
      blog.likes.push(userId);
      liked = true;
    } else {
      blog.likes.splice(index, 1);
      liked = false;
    }
    await blog.save();
    res.status(200).json({ success: true, liked, likesCount: blog.likes.length });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error toggling like', error: error.message });
  }
};

// Add a comment to a blog
exports.addComment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Comment text is required' });
    }
    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({ success: false, message: 'Blog not found' });
    }
    blog.comments.push({ user: userId, text: text.trim() });
    await blog.save();
    res.status(201).json({ success: true, message: 'Comment added', comments: blog.comments });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error adding comment', error: error.message });
  }
};