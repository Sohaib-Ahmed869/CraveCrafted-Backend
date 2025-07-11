const mongoose = require('mongoose');
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected');
  } catch (error) {
    console.error('Database connection error:', error);  
    process.exit(1);
  } 
};
module.exports = { 
  connectDB, 
  userData: mongoose.connection.useDb('Cravecraft_userdata'),  
  systemData: mongoose.connection.useDb('Cravecraft_systemdata')
};