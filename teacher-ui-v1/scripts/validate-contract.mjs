import SwaggerParser from "@apidevtools/swagger-parser";
await SwaggerParser.validate("docs/openapi.json");
console.info("候选 OpenAPI 3.0 契约校验通过；仍需团队会签。");
