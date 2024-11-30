// Import required modules
const express = require('express'); // Import Express framework
const mongoose = require('mongoose'); // Import Mongoose for MongoDB interaction
const multer = require('multer'); // Import Multer for file upload handling
const path = require('path'); // Import Path for file path manipulation
const fs = require('fs'); // Import File System module for file operations
const cors = require('cors'); // Import CORS for enabling cross-origin requests
const CryptoJS = require('crypto-js'); // Import CryptoJS for encryption
const jwt = require('jsonwebtoken'); // Import JWT for token generation and verification
require('dotenv').config();

// Initialize Express app
const app = express(); // Create Express app instance
const port = process.env.PORT || 5000; // Define port number

// Middleware
app.use(cors()); // Enable CORS middleware to allow cross-origin requests
app.use(express.json()); // Parse incoming JSON requests

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB")) // Connection success message
  .catch((error) => console.error("MongoDB connection error:", error)); // Connection error message

  // Use secrets from .env for encryption and JWT
const jwtSecret = process.env.JWT_SECRET;
const encryptionSecret = process.env.ENCRYPTION_SECRET;

// Image storage engine using Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = './upload/images'; // Define upload path
    fs.mkdirSync(uploadPath, { recursive: true }); // Create directory if it doesn't exist
    cb(null, uploadPath); // Callback with destination path
  },
  filename: (req, file, cb) => {
    cb(null, `${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`); // Callback with filename
  },
});

const upload = multer({ storage: storage }); // Initialize Multer with defined storage engine

// Image Upload API endpoint
app.use('/images', express.static('upload/images')); // Serve static files from the upload/images directory
app.post('/upload', upload.single('product'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No image uploaded" }); // Return error if no file uploaded
  }
  res.json({
    success: 1,
    img_url: `http://localhost:${port}/images/${req.file.filename}`, // Return image URL on successful upload
  });
});

// Server root endpoint
app.get("/", (req, res) => {
  res.send("Welcome to SSR Styles"); // Welcome message for root endpoint
});

// Schema for creating a new product and validating data
const productSchema = new mongoose.Schema({
  id: {
    type: Number,
    required: false, // Make id optional
  },
  name: {
    type: String,
    required: true,
  },
  image: {
    type: String,
    required: [true, "Image url is required"],
  },
  category: {
    type: String,
    required: true,
  },
  new_price: {
    type: Number,
    required: true,
  },
  old_price: {
    type: Number,
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
  available: {
    type: Boolean,
    default: true,
  },
});

const Product = mongoose.model("Product", productSchema, "products");

// Endpoint to fetch all products
app.get("/products", async (req, res) => {
  try {
    const products = await Product.find({});
    res.json(products);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Endpoint to add a new product
app.post("/addproduct", async (req, res) => {
  try {
    let product = await Product.find({});
    let id = product.length > 0 ? product[product.length - 1].id + 1 : 1;
    const newProduct = new Product({
      id: id,
      name: req.body.name,
      image: req.body.image,
      category: req.body.category,
      new_price: req.body.new_price,
      old_price: req.body.old_price,
    });
    console.log("New Product Data:", newProduct);
    await newProduct.save();
    console.log("Product added");
    res.json({
      success: true,
      name: req.body.name,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Endpoint to remove a product
app.post("/removeproduct", async (req, res) => {
  try {
    const productId = req.body.id;

    // Find the product by ID and remove it
    await Product.findOneAndDelete({ id: productId });

    console.log("Product removed:", productId);
    res.json({ success: true });
  } catch (error) {
    console.error("Error removing product:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Define User Schema and Model for MongoDB
const userSchema = new mongoose.Schema({
  name: {
    type: String,
  },
  email: {
    type: String,
    unique: true,
  },
  password: {
    type: String,
  },
  cartData: {
    type: Object,
    default: {}, // Default cartData to empty object
  },
  date: {
    type: Date,
    default: Date.now,
  }
});

const User = mongoose.model('User', userSchema); // Create User model

// User registration endpoint
app.post('/signup', async (req, res) => {
  let cart = {}; // Define cart variable to store user's cart data

  try {
    // Check if email already exists in the database
    const existingUser = await User.findOne({ email: req.body.email });
    if (existingUser) {
      return res.status(400).json({ success: false, error: "Email is already registered!" });
    }

    // Initialize the cart object
    for (let i = 0; i < 100; i++) {
      cart[i] = 0;
    }

    // Encrypt password using CryptoJS
    const encryptedPassword = CryptoJS.AES.encrypt(req.body.password, "Secret key").toString();

    // Create new user with provided data and default cart
    const newUser = new User({
      name: req.body.name,
      email: req.body.email,
      password: encryptedPassword,
      cartData: cart, // Initialize user's cart with default values
    });

    // Save new user to the database
    await newUser.save();

    // Generate JWT token for user authentication
    const token = jwt.sign({ userId: newUser._id }, 'secret', { expiresIn: '1h' });

    // Print signup data to terminal
    console.log("Signup Data:", newUser);

    // Return success response with token and user's cart data
    res.status(201).json({ success: true, token, cartData: newUser.cartData });
  } catch (error) {
    // Handle any errors that occur during user registration
    console.error('Error in user registration:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// User login endpoint
app.post('/login', async (req, res) => {
  try {
    // Find user by email in the database
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // Decrypt stored password and compare with provided password
    const bytes = CryptoJS.AES.decrypt(user.password, 'Secret key');
    const originalPassword = bytes.toString(CryptoJS.enc.Utf8);
    if (originalPassword !== req.body.password) {
      return res.status(401).json({ success: false, error: "Incorrect password" });
    }

    // Generate JWT token for user authentication
    const token = jwt.sign({ userId: user._id }, 'secret', { expiresIn: '1h' });

    // Print login data to terminal
    console.log("Login Data:", user);

    // Return success response with token and user's cart data
    res.status(200).json({ success: true, token, cartData: user.cartData });
  } catch (error) {
    // Handle any errors that occur during user login
    console.error('Error in user login:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ShopContextProvider.jsx
const fetchUser = async (req, res, next) => {
  const token = req.header('auth-token');
  if (!token) {
    return res.status(401).send({ errors: "Please authenticate using a valid token" });
  } else {
    try {
      const data = jwt.verify(token, 'secret'); // Verify token using secret key
      req.user = data.userId; // Set user data in request object
      next(); // Proceed to next middleware
    } catch (error) {
      return res.status(401).send({ errors: "Please authenticate using a valid token" });
    }
  }
};

app.post('/addtocart', fetchUser, async (req, res) => {
  try {
    // Find user data by ID
    let userData = await User.findOne({ _id: req.user });

    // Check if user data exists
    if (!userData) {
      console.log("User not found");
      return res.status(404).send("User not found");
    }

    // Get the item ID from the request body
    const itemId = req.body.itemId;

    // Check if itemId exists in the cartData object
    if (!userData.cartData[itemId]) {
      // If itemId doesn't exist, initialize it with count 1
      userData.cartData[itemId] = 1;
    } else {
      // If itemId exists, increment its count
      userData.cartData[itemId] += 1;
    }

    // Update user's cartData in the database
    await User.findOneAndUpdate({ _id: req.user }, { cartData: userData.cartData });

    // Print item number and item ID to the terminal
    console.log(`Item ${userData.cartData[itemId]} with ID ${itemId} added to the cart`);

    // Send success response
    res.send("Item added to the cart");
  } catch (error) {
    console.error("Error adding item to cart:", error);
    res.status(500).send("Internal server error");
  }
});

app.post('/removefromcart', fetchUser, async (req, res) => {
  try {
    console.log("removed", req.body.itemId);
    // Find user data by ID
    let userData = await User.findOne({ _id: req.user });

    // Check if userData exists
    if (!userData) {
      return res.status(404).send("User not found");
    }

    // Check if itemId exists in the cartData object and it's greater than 0
    const itemId = req.body.itemId;
    if (!userData.cartData[itemId] || userData.cartData[itemId] <= 0) {
      return res.status(400).send("Item not found in cart");
    }

    // Decrease the count of the item in the cart
    userData.cartData[itemId] -= 1;

    // Update user's cartData in the database
    await User.findOneAndUpdate({ _id: req.user }, { cartData: userData.cartData });

    // Send success response
    res.send("Removed one item");
  } catch (error) {
    console.error("Error removing item from cart:", error);
    res.status(500).send("Internal server error");
  }
});

// Update the route handler for fetching cart items
app.post('/getcart', fetchUser, async (req, res) => {
  console.log("Get Cart");
  try {
    let userData = await User.findOne({ _id: req.user }); // Corrected access to req.user
    res.json(userData.cartData);
  } catch (error) {
    console.error("Error fetching user cart data:", error);
    res.status(500).send("Internal server error");
  }
});

// Endpoint to fetch new collections
app.get('/newcollection', async (req, res) => {
  try {
    // Fetch all products from the database
    let products = await Product.find({});
    // Extract the latest 8 products as new collection
    let newcollection = products.slice(-8);
    console.log("New Collection Fetched");
    // Send the new collection as response
    res.send(newcollection);
  } catch (error) {
    console.error("Error fetching new collection:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Endpoint to fetch popular items in the women's section
app.get('/popularinwomen', async (req, res) => {
  try {
    // Fetch products with category "women" from the database
    let products = await Product.find({ category: "women" });
    // Extract the first 4 products as popular items in women's section
    let popular_in_women = products.slice(0, 4);
    console.log("Popular In Women Section Fetched");
    // Send the popular items in women's section as response
    res.send(popular_in_women);
  } catch (error) {
    console.error("Error fetching popular items in women's section:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something went wrong!');
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
