const { MongoClient, ServerApiVersion } = require("mongodb");
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
