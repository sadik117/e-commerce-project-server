import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
require("dotenv").config();
import express, { json } from "express";
import cors from "cors";
import { uploader } from "./config/cloudinary";

const app = express();
const port = process.env.PORT || 3000;

const allowedOrigins = [
  "http://localhost:5173",
  "https://robe-by-shamshad.vercel.app",
  "https://www.robebyshamshad.com",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like Postman or server-side)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

app.use(json({ limit: "10mb" }));

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
    const slidesCollection = db.collection("slides");

    // Upload image to Cloudinary
    app.post("/upload", async (req, res) => {
      try {
        const { image } = req.body;
        if (!image) {
          return res
            .status(400)
            .json({ success: false, message: "No image provided" });
        }

        const uploadResponse = await uploader.upload(image, {
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

    // CREATE / ASSIGN Coupon (supports single user OR all users)
    app.post("/coupons", async (req, res) => {
      try {
        const { userEmail, code, discount, forAll } = req.body;

        if (!code || !discount) {
          return res.status(400).json({
            success: false,
            message: "Code and discount are required",
          });
        }

        // Check if coupon code already exists globally
        const exists = await couponsCollection.findOne({ code });
        if (exists) {
          return res.status(409).json({
            success: false,
            message: "Coupon code already exists",
          });
        }

        // If assigning to all users
        if (forAll) {
          const allUsers = await usersCollection.find().toArray();

          if (allUsers.length === 0) {
            return res.status(404).json({
              success: false,
              message: "No users found to assign coupon",
            });
          }

          const bulkCoupons = allUsers.map((user) => ({
            userEmail: user.email,
            code,
            discount,
            createdAt: new Date(),
            used: false,
          }));

          await couponsCollection.insertMany(bulkCoupons);

          return res.status(201).json({
            success: true,
            message: "Coupon assigned to all users successfully",
          });
        }

        // Assign to ONE USER
        if (!userEmail) {
          return res.status(400).json({
            success: false,
            message: "User email is required when not assigning to all",
          });
        }

        const coupon = {
          userEmail,
          code,
          discount,
          createdAt: new Date(),
          used: false,
        };

        await couponsCollection.insertOne(coupon);

        res.status(201).json({
          success: true,
          message: "Coupon assigned successfully",
          coupon,
        });
      } catch (error) {
        console.error("Create coupon failed:", error);
        res.status(500).json({
          success: false,
          message: "Server error",
        });
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

    // GET all coupons
    app.get("/coupons", async (req, res) => {
      try {
        const coupons = await couponsCollection.find().toArray();
        res.status(200).json({ success: true, coupons });
      } catch (error) {
        console.error("Error fetching coupons:", error);
        res
          .status(500)
          .json({ success: false, message: "Failed to fetch coupons" });
      }
    });

    // CREATE a new coupon
    app.post("/coupons", async (req, res) => {
      try {
        const { code, discount, expiryDate, description } = req.body;

        if (!code || !discount || !expiryDate) {
          return res
            .status(400)
            .json({ success: false, message: "All fields are required" });
        }

        const existing = await couponsCollection.findOne({ code });
        if (existing) {
          return res
            .status(409)
            .json({ success: false, message: "Coupon code already exists" });
        }

        const newCoupon = {
          code,
          discount,
          expiryDate,
          description: description || "",
          createdAt: new Date(),
        };

        await couponsCollection.insertOne(newCoupon);
        res.status(201).json({
          success: true,
          message: "Coupon created successfully",
          coupon: newCoupon,
        });
      } catch (error) {
        console.error("Error creating coupon:", error);
        res
          .status(500)
          .json({ success: false, message: "Failed to create coupon" });
      }
    });

    //  DELETE a coupon by ID
    app.delete("/coupons/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const result = await couponsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res
            .status(404)
            .json({ success: false, message: "Coupon not found" });
        }

        res
          .status(200)
          .json({ success: true, message: "Coupon deleted successfully" });
      } catch (error) {
        console.error("Error deleting coupon:", error);
        res
          .status(500)
          .json({ success: false, message: "Failed to delete coupon" });
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

    // GET user by role
    app.get("/users/role/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const user = await usersCollection.findOne({ email });
        if (!user) {
          return res.status(404).send({ role: null });
        }
        res.send({ role: user.role });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    /**
     * GET /slides
     * Returns all slides
     */
    app.get("/slides", async (req, res) => {
      try {
        const slides = await slidesCollection.find({}).toArray();
        res.json(slides);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch slides" });
      }
    });

    /**
     * GET /slides/:id
     */
    app.get("/slides/:id", async (req, res) => {
      try {
        const slide = await slidesCollection.findOne({
          _id: new ObjectId(req.params.id),
        });

        if (!slide) return res.status(404).json({ error: "Slide not found" });

        res.json(slide);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Invalid ID or server error" });
      }
    });

    /**
     * POST /slides
     * Body: { image, title, subtitle }
     */
    app.post("/slides", async (req, res) => {
      const { image, title, subtitle } = req.body;

      if (!image) {
        return res.status(400).json({ error: "Image is required" });
      }

      try {
        const result = await slidesCollection.insertOne({
          image,
          title,
          subtitle,
          createdAt: new Date(),
        });

        const newSlide = {
          _id: result.insertedId,
          image,
          title,
          subtitle,
        };

        res.status(201).json(newSlide);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to create slide" });
      }
    });

    /**
     * PUT /slides/:id
     * Body: { image?, title?, subtitle? }
     */
    app.put("/slides/:id", async (req, res) => {
      const updates = req.body;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "Nothing to update" });
      }

      try {
        const result = await slidesCollection.findOneAndUpdate(
          { _id: new ObjectId(req.params.id) },
          { $set: updates },
          { returnDocument: "after" }
        );

        if (!result.value) {
          return res.status(404).json({ error: "Slide not found" });
        }

        res.json(result.value);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Invalid ID or failed to update slide" });
      }
    });

    /**
     * DELETE /slides/:id
     */
    app.delete("/slides/:id", async (req, res) => {
      try {
        const result = await slidesCollection.findOneAndDelete({
          _id: new ObjectId(req.params.id),
        });

        if (!result.value) {
          return res.status(404).json({ error: "Slide not found" });
        }

        res.json({ message: "Slide deleted" });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Invalid ID or failed to delete slide" });
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
