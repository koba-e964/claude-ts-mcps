/**
 * 指定したバイト数の乱数を生成するModel Context Protocol(MCP)サーバーの実装
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { parseArgs } from "node:util";
import * as crypto from "crypto";

// コマンドライン引数の解析
const { values } = parseArgs({
  options: {
    verbose: {
      type: "boolean",
      short: "v",
      count: true,
      default: false,
      help: "Enable verbose logging",
    },
    maxSize: {
      type: "string",
      short: "m",
      default: "1048576", // 1MB
      help: "Maximum random bytes size (in bytes)",
    },
  },
  allowPositionals: true,
});

const verbose = values.verbose;
const maxRandomSize = parseInt(values.maxSize as string, 10);

// 詳細度フラグに基づいてログレベルを設定
const logLevel = verbose ? "debug" : "info";
function log(level: string, ...args: any[]) {
  if (level === "debug" && logLevel !== "debug") return;
  console.error(`[${level.toUpperCase()}]`, ...args);
}

// 乱数生成クラス
class RandomGenerator {
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  /**
   * 指定したバイト数の暗号学的に安全な乱数を生成
   * @param size 生成するバイト数
   * @returns 乱数バッファ
   */
  async generateRandomBytes(size: number): Promise<Buffer> {
    // 最大サイズを超えないことを確認
    if (size > this.maxSize) {
      throw new Error(
        `Requested size ${size} exceeds maximum allowed size of ${this.maxSize} bytes`
      );
    }

    // 負の値や無効な値をチェック
    if (size <= 0 || !Number.isInteger(size)) {
      throw new Error(
        `Invalid size: ${size}. Size must be a positive integer.`
      );
    }

    // 乱数生成
    return crypto.randomBytes(size);
  }

  /**
   * 整数範囲内の乱数を生成
   * @param min 最小値（含む）
   * @param max 最大値（含む）
   * @returns 生成された整数
   */
  generateRandomInt(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new Error("Min and max must be integers");
    }

    if (min >= max) {
      throw new Error("Min must be less than max");
    }

    // 安全な乱数を生成するためにcrypto.randomIntを使用
    return crypto.randomInt(min, max + 1); // maxも含める
  }
}

// ツール入力用のZodスキーマを定義
const GenerateRandomBytesSchema = z.object({
  size: z.number().int().positive(),
  encoding: z.enum(["hex", "base64", "binary"]).optional().default("hex"),
});

const GenerateRandomIntSchema = z.object({
  min: z.number().int(),
  max: z.number().int(),
});

// 乱数ツール名をenumオブジェクトとして定義
const RandomTools = {
  GENERATE_BYTES: "random_generate_bytes",
  GENERATE_INT: "random_generate_int",
} as const;

// MCPサーバーを初期化
const server = new McpServer({
  name: "mcp-random-generator",
  version: "1.0.0",
});

// 乱数生成器のインスタンスを作成
const randomGenerator = new RandomGenerator(maxRandomSize);

// 乱数バイト生成ツールを定義
server.tool(
  RandomTools.GENERATE_BYTES,
  "Generates cryptographically secure random bytes",
  GenerateRandomBytesSchema.shape,
  async (args) => {
    try {
      const randomBytes = await randomGenerator.generateRandomBytes(args.size);

      // 要求された形式でエンコード
      let encodedData: string;
      if (args.encoding === "hex") {
        encodedData = randomBytes.toString("hex");
      } else if (args.encoding === "base64") {
        encodedData = randomBytes.toString("base64");
      } else {
        // binaryの場合はバッファをそのまま文字列として返す
        encodedData = randomBytes.toString("binary");
      }

      return {
        content: [
          {
            type: "text",
            text: `Random bytes (${args.size} bytes, ${args.encoding} encoded):\n${encodedData}`,
          },
        ],
        isError: false,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
        isError: true,
      };
    }
  }
);

// 整数範囲の乱数生成ツールを定義
server.tool(
  RandomTools.GENERATE_INT,
  "Generates a random integer within the specified range (inclusive)",
  GenerateRandomIntSchema.shape,
  async (args) => {
    try {
      const randomInt = randomGenerator.generateRandomInt(args.min, args.max);
      return {
        content: [
          {
            type: "text",
            text: `Random integer between ${args.min} and ${args.max}: ${randomInt}`,
          },
        ],
        isError: false,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
        isError: true,
      };
    }
  }
);

// サーバーを起動
async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    log("info", "Random Generator MCP Server started");
    log("info", `Maximum random bytes size: ${maxRandomSize} bytes`);
  } catch (error) {
    log("error", `Server error: ${error}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
