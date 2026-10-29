
const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient } = require("mongodb");
const aiRoutes = require("./ai");

const app = express();
const PORT = process.env.PORT || 3001;
const client = new MongoClient(process.env.MONGODB_URI);

app.use(cors());
app.use(express.json());
app.use("/api/ai", aiRoutes);

// Kiểm tra backend
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "HifeDB Backend đang hoạt động!"
  });
});

// Kiểm tra kết nối MongoDB
app.get("/api/db-status", async (req, res) => {
  try {
    await client.db("admin").command({ ping: 1 });

    res.json({
      success: true,
      message: "Kết nối MongoDB Atlas thành công!"
    });
    } catch (error) {
    console.error("Lỗi kiểm tra Replication:", error.message);

    res.status(500).json({
      success: false,
      message: "Không thể đọc trạng thái Replication."
    });
  }
});

// Kiểm tra trạng thái MongoDB Replication
app.get("/api/replication-status", async (req, res) => {
  try {
    const result = await client.db("admin").command({
      replSetGetStatus: 1
    });

    res.json({
      success: true,
      replicaSet: result.set,
      members: result.members.map(member => ({
        name: member.name,
        state: member.stateStr,
        health: member.health
      }))
    });
  } catch (error) {
    console.error("Lỗi kiểm tra Replication:", error.message);

    res.status(500).json({
      success: false,
      message: "Không thể đọc trạng thái Replication.",
      error: error.message
    });
  }
});

// Lấy danh sách database
app.get("/api/databases", async (req, res) => {
  try {
    const result = await client.db("admin").admin().listDatabases();

    res.json({
      success: true,
      databases: result.databases.map(db => ({
        name: db.name,
        sizeOnDisk: db.sizeOnDisk,
        empty: db.empty
      }))
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách database."
    });
  }
});

// Tạo database mới
app.post("/api/databases", async (req, res) => {
  try {
    const { name } = req.body;

    if (
      typeof name !== "string" ||
      !/^[a-zA-Z][a-zA-Z0-9_-]{0,62}$/.test(name)
    ) {
      return res.status(400).json({
        success: false,
        message: "Tên database không hợp lệ."
      });
    }

    const db = client.db(name);
    await db.createCollection("records");

    res.status(201).json({
      success: true,
      message: "Tạo database thành công!",
      database: name,
      defaultCollection: "records"
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({
      success: false,
      message: "Không thể tạo database. Tên có thể đã tồn tại."
    });
  }
});

// Lấy danh sách collection
app.get("/api/databases/:name/collections", async (req, res) => {
  try {
    const name = req.params.name;

    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,62}$/.test(name)) {
      return res.status(400).json({
        success: false,
        message: "Tên database không hợp lệ."
      });
    }

    const collections = await client
      .db(name)
      .listCollections({}, { nameOnly: true })
      .toArray();

    res.json({
      success: true,
      database: name,
      collections: collections.map(item => item.name)
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({
      success: false,
      message: "Không thể lấy danh sách collection."
    });
  }
});

// Tạo collection
app.post("/api/databases/:name/collections", async (req, res) => {
  try {
    const databaseName = req.params.name;
    const { collectionName } = req.body;

    if (
      !/^[a-zA-Z][a-zA-Z0-9_-]{0,62}$/.test(databaseName) ||
      typeof collectionName !== "string" ||
      !/^[a-zA-Z][a-zA-Z0-9_-]{0,62}$/.test(collectionName)
    ) {
      return res.status(400).json({
        success: false,
        message: "Tên database hoặc collection không hợp lệ."
      });
    }

    await client.db(databaseName).createCollection(collectionName);

    res.status(201).json({
      success: true,
      message: "Tạo collection thành công!",
      database: databaseName,
      collection: collectionName
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({
      success: false,
      message: "Không thể tạo collection. Có thể tên đã tồn tại."
    });
  }
});

// Khởi động server sau khi kết nối MongoDB
async function startServer() {
  try {
    await client.connect();
    console.log("Đã kết nối MongoDB Atlas thành công!");

    app.listen(PORT, () => {
      console.log(
        `HifeDB Backend đang chạy tại http://localhost:${PORT}`
      );
    });
  } catch (error) {
    console.error(
      "Không thể kết nối MongoDB Atlas:",
      error.message
    );
    process.exit(1);
  }
}

startServer();
