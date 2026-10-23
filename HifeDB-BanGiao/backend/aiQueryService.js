const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function generateMongoQuery({
  question,
  collection,
  fields,
}) {
  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",

    instructions: `
Bạn là AI Agent của HifeDB, chuyên tạo truy vấn đọc dữ liệu MongoDB.

Quy tắc:
- Chỉ tạo truy vấn find để đọc dữ liệu.
- Không tạo lệnh insert, update, delete, drop hoặc aggregate.
- Chỉ dùng collection được cung cấp.
- Chỉ dùng các trường trong danh sách schema được cung cấp.
- Nếu yêu cầu không rõ, giải thích trong trường explanation.
- Giới hạn truy vấn tối đa 100 tài liệu.
- filterJson, projectionJson và sortJson phải là chuỗi JSON hợp lệ.
- Không tự khẳng định đã chạy truy vấn.
- Trả lời bằng tiếng Việt.
`,

    input: JSON.stringify({
      question,
      allowedCollection: collection,
      availableFields: fields,
      requestedOutput: {
        collection: "Tên collection",
        filterJson: "JSON filter",
        projectionJson: "JSON projection",
        sortJson: "JSON sort",
        limit: 20,
        explanation: "Giải thích truy vấn bằng tiếng Việt",
      },
    }),

    text: {
      format: {
        type: "json_schema",
        name: "mongo_read_query",
        strict: true,
        schema: {
          type: "object",
          properties: {
            collection: { type: "string" },
            filterJson: { type: "string" },
            projectionJson: { type: "string" },
            sortJson: { type: "string" },
            limit: { type: "integer" },
            explanation: { type: "string" },
          },
          required: [
            "collection",
            "filterJson",
            "projectionJson",
            "sortJson",
            "limit",
            "explanation",
          ],
          additionalProperties: false,
        },
      },
    },
  });

  if (!response.output_text) {
    throw new Error("AI không trả về nội dung truy vấn.");
  }

  const result = JSON.parse(response.output_text);

  return result;
}

module.exports = { generateMongoQuery };