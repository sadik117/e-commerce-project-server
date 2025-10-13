const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cloudinary = require("./config/cloudinary");

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.8tecw61.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create MongoClient once globally
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB");

    // DB + Collections
    const db = client.db("robeDB");
    const productsCollection = db.collection("products");
    const ordersCollection = db.collection("orders");

    // Upload image to cloudinary
    app.post("/upload", async (req, res) => {
      try {
        const { image } = req.body;

        if (!image) {
          return res
            .status(400)
            .json({ success: false, message: "No image provided" });
        }

        const uploadResponse = await cloudinary.uploader.upload(image, {
          folder: "robe_products",
        });

        res.json({
          success: true,
          url: uploadResponse.secure_url,
        });
      } catch (error) {
        console.error("Cloudinary upload failed:", error);
        res.status(500).json({ success: false, message: "Upload failed" });
      }
    });

    // Add product to mongoDB
    app.post("/products", async (req, res) => {
      try {
        const product = req.body;
        const result = await productsCollection.insertOne(product);
        res.json({ success: true, result });
      } catch (err) {
        console.error("Product insert failed:", err);
        res.status(500).json({ success: false, message: err.message });
      }
    });

    // Get all products
    app.get("/products", async (req, res) => {
      try {
        const products = await productsCollection.find().toArray();
        res.json({ success: true, products });
      } catch (err) {
        console.error("Failed to fetch products:", err);
        res.status(500).json({ success: false, message: err.message });
      }
    });

    // Get single product by ID
    app.get("/products/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const product = await productsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!product) {
          return res
            .status(404)
            .json({ success: false, message: "Product not found" });
        }

        res.json({ success: true, product });
      } catch (err) {
        console.error("Failed to fetch product:", err);
        res.status(500).json({ success: false, message: err.message });
      }
    });

    // POST order
    app.post("/orders", async (req, res) => {
      try {
        const order = req.body;

        if (
          !order ||
          !order.customer ||
          !order.items ||
          order.items.length === 0
        ) {
          return res.status(400).json({ message: "Invalid order data" });
        }

        // Add a createdAt timestamp if not provided
        if (!order.createdAt) order.createdAt = new Date();

        const result = await ordersCollection.insertOne(order);

        res.status(201).json({
          message: "Order placed successfully",
          orderId: result.insertedId,
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
      }
    });

    // Get all orders
    app.get("/orders", async (req, res) => {
      try {
        const orders = await ordersCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();
        res.status(200).json(orders);
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to fetch orders" });
      }
    });

    // Root route
    app.get("/", (req, res) => {
      res.send("E-Commerce of Robe by Shomshed is running..");
    });

    // Start server
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error("MongoDB connection failed:", error);
  }
}

run();
