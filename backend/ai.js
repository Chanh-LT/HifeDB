const express = require("express");
const { MongoClient } = require("mongodb");
const { generateMongoQuery } = require("./aiQueryService");
const router = express.Router();

const client = new MongoClient(process.env.MONGODB_URI || "mongodb://localhost:27017/shop_db", {
  serverSelectionTimeoutMS: 2000
});
let clientPromise;

function getClient() {
  if (!clientPromise) {
    clientPromise = client.connect().catch((error) => {
      clientPromise = null;
      throw error;
    });
  }

  return clientPromise;
}

function parseJsonObject(value, name) {
  let result;

  try {
    result = JSON.parse(value);
  } catch {
    throw new Error(`${name} không phải JSON hợp lệ.`);
  }

  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result)
  ) {
    throw new Error(`${name} phải là một JSON object.`);
  }

  return result;
}

// Chỉ cho phép các toán tử đọc dữ liệu đã định nghĩa.
const allowedOperators = new Set([
  "$eq", "$ne", "$gt", "$gte", "$lt", "$lte",
  "$in", "$nin", "$and", "$or", "$exists",
  "$regex", "$options",
]);

function validateFilter(value, depth = 0) {
  if (depth > 5) {
    throw new Error("Filter lồng nhau quá sâu.");
  }

  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error("Filter không hợp lệ.");
  }

  for (const [key, item] of Object.entries(value)) {
    if (key.startsWith("$")) {
      if (!allowedOperators.has(key)) {
        throw new Error(`Không cho phép toán tử ${key}.`);
      }

      if (["$and", "$or", "$in", "$nin"].includes(key)) {
        if (!Array.isArray(item)) {
          throw new Error(`${key} phải là một mảng.`);
        }

        if (["$and", "$or"].includes(key)) {
          item.forEach((child) => validateFilter(child, depth + 1));
        }
      }
    } else if (
      item &&
      typeof item === "object" &&
      !Array.isArray(item)
    ) {
      validateFilter(item, depth + 1);
    }
  }
}

function validateProjection(projection) {
  for (const [key, value] of Object.entries(projection)) {
    if (key.startsWith("$")) {
      throw new Error("Projection chứa trường không hợp lệ.");
    }

    if (![0, 1].includes(value)) {
      throw new Error("Projection chỉ nhận giá trị 0 hoặc 1.");
    }
  }
}

function validateSort(sort) {
  for (const [key, value] of Object.entries(sort)) {
    if (key.startsWith("$") || ![-1, 1].includes(value)) {
      throw new Error("Sort không hợp lệ.");
    }
  }
}

// POST /api/ai/generate
router.post("/generate", async (req, res) => {
  try {
    const question = req.body.question || req.body.prompt;
    const { collection } = req.body;
    const dbName = req.body.database || process.env.MONGODB_DB_NAME || "shop_db";

    if (
      typeof question !== "string" ||
      !question.trim() ||
      question.length > 1000
    ) {
      return res.status(400).json({
        success: false,
        message: "Yêu cầu truy vấn (prompt/question) không hợp lệ hoặc quá dài.",
      });
    }

    let fields = ["_id", "name", "price", "category", "stock", "active"];

    try {
      const connectedClient = await getClient();
      const db = connectedClient.db(dbName);

      const collections = await db.listCollections(
        { name: collection },
        { nameOnly: true }
      ).toArray();

      if (collections.length > 0) {
        const sample = await db.collection(collection).findOne(
          {},
          { projection: { _id: 0 } }
        );
        if (sample) {
          fields = Object.keys(sample);
        }
      }
    } catch (dbErr) {
      console.warn("MongoDB chưa sẵn sàng để đọc schema động, dùng schema mặc định:", dbErr.message);
    }

    const query = await generateMongoQuery({
      question: question.trim(),
      collection,
      fields,
    });

    if (query.collection !== collection) {
      throw new Error("AI trả về collection không được yêu cầu.");
    }

    const filter = parseJsonObject(query.filterJson, "Filter");
    const projection = parseJsonObject(
      query.projectionJson,
      "Projection"
    );
    const sort = parseJsonObject(query.sortJson, "Sort");

    validateFilter(filter);
    validateProjection(projection);
    validateSort(sort);

    if (
      !Number.isInteger(query.limit) ||
      query.limit < 1 ||
      query.limit > 100
    ) {
      throw new Error("Giới hạn số tài liệu không hợp lệ.");
    }

    // Trả truy vấn về frontend để người dùng xem trước.
    res.json({
      success: true,
      query: {
        collection,
        filter,
        projection,
        sort,
        limit: query.limit,
      },
      explanation: query.explanation,
    });
  } catch (error) {
    console.error("AI generate error:", error.message);

    res.status(500).json({
      success: false,
      message: "Không thể tạo truy vấn. Hãy kiểm tra cấu hình AI và backend.",
    });
  }
});

// POST /api/ai/execute
// Chỉ thực thi truy vấn find đã được kiểm tra.
router.post("/execute", async (req, res) => {
  try {
    const { collection, filter, projection, sort, limit } = req.body;

    if (
      typeof collection !== "string" ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(collection)
    ) {
      return res.status(400).json({
        success: false,
        message: "Tên collection không hợp lệ.",
      });
    }

    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Limit phải từ 1 đến 100.",
      });
    }

    if (
      !filter ||
      typeof filter !== "object" ||
      Array.isArray(filter) ||
      !projection ||
      typeof projection !== "object" ||
      Array.isArray(projection) ||
      !sort ||
      typeof sort !== "object" ||
      Array.isArray(sort)
    ) {
      return res.status(400).json({
        success: false,
        message: "Cấu trúc truy vấn không hợp lệ.",
      });
    }

    validateFilter(filter);
    validateProjection(projection);
    validateSort(sort);

    const dbName = req.body.database || process.env.MONGODB_DB_NAME || "shop_db";
    const connectedClient = await getClient();
    const db = connectedClient.db(dbName);

    const collections = await db.listCollections(
      { name: collection },
      { nameOnly: true }
    ).toArray();

    if (collections.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy collection.",
      });
    }

    const documents = await db.collection(collection)
      .find(filter, { projection })
      .sort(sort)
      .limit(limit)
      .toArray();

    res.json({
      success: true,
      count: documents.length,
      documents,
    });
  } catch (error) {
    console.error("AI execute error:", error.message);

    res.status(400).json({
      success: false,
      message: "Không thể thực thi truy vấn đã gửi.",
    });
  }
});

module.exports = router;