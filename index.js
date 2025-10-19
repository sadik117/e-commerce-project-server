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

    const db = client.db("robeDB");
    const productsCollection = db.collection("products");
    const ordersCollection = db.collection("orders");
    const usersCollection = db.collection("users");
    const couponsCollection = db.collection("coupons");

    // Upload image to Cloudinary
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

        res.json({ success: true, url: uploadResponse.secure_url });
      } catch (error) {
        console.error("Cloudinary upload failed:", error);
        res.status(500).json({ success: false, message: "Upload failed" });
      }
    });

    // Add product
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

    // Get single product
    app.get("/products/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const product = await productsCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!product)
          return res
            .status(404)
            .json({ success: false, message: "Product not found" });
        res.json({ success: true, product });
      } catch (err) {
        console.error("Failed to fetch product:", err);
        res.status(500).json({ success: false, message: err.message });
      }
    });

    // Update product
    app.put("/products/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = req.body;
        if (!ObjectId.isValid(id)) {
          return res
            .status(400)
            .json({ success: false, message: "Invalid product ID" });
        }

        const result = await productsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
        );

        if (result.matchedCount === 0)
          return res
            .status(404)
            .json({ success: false, message: "Product not found" });

        res.json({ success: true, message: "Product updated successfully" });
      } catch (err) {
        console.error("Failed to update product:", err);
        res.status(500).json({ success: false, message: err.message });
      }
    });

    // Delete product
    app.delete("/products/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res
            .status(400)
            .json({ success: false, message: "Invalid product ID" });
        }

        const result = await productsCollection.deleteOne({
          _id: new ObjectId(id),
        });
        if (result.deletedCount === 0)
          return res
            .status(404)
            .json({ success: false, message: "Product not found" });

        res.json({ success: true, message: "Product deleted successfully" });
      } catch (err) {
        console.error("Failed to delete product:", err);
        res.status(500).json({ success: false, message: err.message });
      }
    });

    // POST order (with coupon usage tracking)
    app.post("/orders", async (req, res) => {
      try {
        const order = req.body;

        if (!order || !order.customer || !order.items?.length) {
          return res.status(400).json({ message: "Invalid order data" });
        }

        if (!order.createdAt) order.createdAt = new Date();

        // Insert order
        const result = await ordersCollection.insertOne(order);

        // If coupon applied → mark as used
        if (order.couponApplied) {
          await couponsCollection.updateOne(
            { code: order.couponApplied },
            { $set: { used: true, usedAt: new Date() } }
          );
        }

        res.status(201).json({
          message: "Order placed successfully",
          orderId: result.insertedId,
        });
      } catch (err) {
        console.error("Order failed:", err);
        res.status(500).json({ message: "Server error" });
      }
    });

    //  Get all orders
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

    //  Create / Assign coupon
    app.post("/coupons", async (req, res) => {
      try {
        const { userEmail, code, discount } = req.body;

        if (!userEmail || !code || !discount) {
          return res
            .status(400)
            .json({ success: false, message: "All fields required" });
        }

        const existing = await couponsCollection.findOne({ code });
        if (existing) {
          return res.json({
            success: false,
            message: "Coupon code already exists!",
          });
        }

        const coupon = {
          userEmail,
          code,
          discount,
          createdAt: new Date(),
          used: false,
        };

        const result = await couponsCollection.insertOne(coupon);
        res.json({ success: true, message: "Coupon assigned", result });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    //  Verify coupon (checks if used)
    app.post("/verify-coupon", async (req, res) => {
      try {
        const { code } = req.body;
        const coupon = await couponsCollection.findOne({ code });

        if (!coupon) {
          return res.json({ valid: false, message: "Invalid coupon" });
        }

        if (coupon.used) {
          return res.json({ valid: false, message: "Coupon already used!" });
        }

        return res.json({
          valid: true,
          discountAmount: coupon.discount,
        });
      } catch (error) {
        console.error("Verify coupon failed:", error);
        res.status(500).json({ valid: false, message: "Server error" });
      }
    });

    // Get all coupons
    app.get("/coupons", async (req, res) => {
      try {
        const coupons = await couponsCollection.find().toArray();
        res.json({ success: true, coupons });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // DELETE coupon
    app.delete("/coupons/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const result = await couponsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({ message: "Coupon not found" });
        }

        res.status(200).json({ message: "Coupon deleted successfully" });
      } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to delete coupon" });
      }
    });

    // POST /users
    app.post("/users", async (req, res) => {
      try {
        const { email, uid } = req.body;
        if (!email || !uid)
          return res
            .status(400)
            .json({ message: "Email and UID are required" });

        const user = await usersCollection.findOne({ email });
        if (user) {
          await usersCollection.updateOne(
            { email },
            { $set: { lastLogin: new Date() } }
          );
          return res.status(200).json({ message: "User updated", user });
        }

        const result = await usersCollection.insertOne(req.body);
        res.status(201).json({ message: "New user logged in", user: result });
      } catch (err) {
        res.status(500).json({ message: err.message });
      }
    });

    // Get all users
    app.get("/users", async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        res.json({ success: true, users });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    //  Root
    app.get("/", (req, res) => {
      res.send("🛍️ Robe by Shamshad server is running...");
    });

    // Start server
    app.listen(port, () => {
      console.log(`🚀 Server running on port ${port}`);
    });
  } catch (error) {
    console.error("MongoDB connection failed:", error);
  }
}

run();
