const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;
const HIFEDB_ROUTER_URL = process.env.HIFEDB_ROUTER_URL || "http://127.0.0.1:8000";

app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.json({
    success: true,
    name: "HifeDB Gateway Proxy",
    target: HIFEDB_ROUTER_URL,
  });
});

// Proxy helper chuyển tiếp toàn bộ yêu cầu /api tới HifeDB Router Gateway (Python Port 8000)
app.use("/api", async (req, res) => {
  const targetUrl = `${HIFEDB_ROUTER_URL}/api${req.url}`;
  try {
    const fetchOptions = {
      method: req.method,
      headers: { "Content-Type": "application/json" },
    };
    if (["POST", "PUT", "PATCH"].includes(req.method) && req.body && Object.keys(req.body).length > 0) {
      fetchOptions.body = JSON.stringify(req.body);
    }
    const response = await fetch(targetUrl, fetchOptions);
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await response.json();
      return res.status(response.status).json(data);
    } else {
      const text = await response.text();
      return res.status(response.status).send(text);
    }
  } catch (error) {
    return res.status(503).json({
      success: false,
      message: "Không thể kết nối đến HifeDB Router Gateway tại " + HIFEDB_ROUTER_URL,
      hint: "Vui lòng khởi động cụm HifeDB bằng file scripts/start-cluster-local.bat",
      error: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`========================================================`);
  console.log(`  HIFEDB GATEWAY PROXY (PORT ${PORT})`);
  console.log(`  Chuyển tiếp API trực tiếp đến HifeDB Router: ${HIFEDB_ROUTER_URL}`);
  console.log(`========================================================`);
});
