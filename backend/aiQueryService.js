const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "dummy-key",
});

async function generateMongoQuery({
  question,
  collection,
  fields,
}) {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "your_openai_api_key_here") {
    // Trả về kết quả mẫu thông minh nếu chưa có OpenAI API key để kiểm thử tính năng
    return {
      collection,
      filterJson: JSON.stringify({ active: true }),
      projectionJson: JSON.stringify({ name: 1, price: 1, category: 1 }),
      sortJson: JSON.stringify({ price: -1 }),
      limit: 10,
      explanation: `Truy vấn tạo tự động (Demo Mode - chưa cấu hình OPENAI_API_KEY trong .env) cho yêu cầu: "${question}". Đang lọc các tài liệu hoạt động và sắp xếp theo giá giảm dần.`
    };
  }

  const promptSystem = `
Bạn là AI Agent của HifeDB, chuyên tạo truy vấn đọc dữ liệu MongoDB.

Quy tắc:
- Chỉ tạo truy vấn find để đọc dữ liệu trên collection: "${collection}".
- Không tạo lệnh insert, update, delete, drop hoặc aggregate.
- Chỉ dùng các trường trong danh sách sau: ${JSON.stringify(fields)}.
- Nếu yêu cầu không rõ, giải thích trong trường explanation.
- Giới hạn truy vấn tối đa 100 tài liệu.
- filterJson, projectionJson và sortJson bắt buộc phải là chuỗi JSON hợp lệ.
- Trả về JSON theo định dạng chính xác sau:
{
  "collection": "${collection}",
  "filterJson": "{}",
  "projectionJson": "{}",
  "sortJson": "{}",
  "limit": 20,
  "explanation": "Giải thích truy vấn bằng tiếng Việt"
}
`;

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    messages: [
      { role: "system", content: promptSystem },
      { role: "user", content: question }
    ],
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("AI không trả về nội dung truy vấn.");
  }

  const result = JSON.parse(content);
  return result;
}

module.exports = { generateMongoQuery };