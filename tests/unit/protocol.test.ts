import { test, expect } from "bun:test";
import { PostgreSQLProtocol } from "../../src/protocol";

const protocol = new PostgreSQLProtocol();

test("detects BEGIN transaction in client query", () => {
  const query = "BEGIN";
  const queryData = Buffer.from(query + "\0");
  const buffer = Buffer.alloc(1 + 4 + queryData.length);
  buffer.writeUInt8("Q".charCodeAt(0), 0);
  buffer.writeUInt32BE(queryData.length + 1, 1);
  queryData.copy(buffer, 5);
  
  const msgs = protocol.parseClientMessage(buffer);
  expect(msgs.length).toBe(1);
  expect(msgs[0].type).toBe("query");
  expect(msgs[0].data.query).toBe(query);
  expect(msgs[0].data.transactionType).toBe("begin");
});

test("detects COMMIT in client query", () => {
  const query = "COMMIT";
  const queryData = Buffer.from(query + "\0");
  const buffer = Buffer.alloc(1 + 4 + queryData.length);
  buffer.writeUInt8("Q".charCodeAt(0), 0);
  buffer.writeUInt32BE(queryData.length + 1, 1);
  queryData.copy(buffer, 5);
  
  const msgs = protocol.parseClientMessage(buffer);
  expect(msgs[0].data.transactionType).toBe("commit");
});

test("detects ROLLBACK in client query", () => {
  const query = "ROLLBACK WORK";
  const queryData = Buffer.from(query + "\0");
  const buffer = Buffer.alloc(1 + 4 + queryData.length);
  buffer.writeUInt8("Q".charCodeAt(0), 0);
  buffer.writeUInt32BE(queryData.length + 1, 1);
  queryData.copy(buffer, 5);
  
  const msgs = protocol.parseClientMessage(buffer);
  expect(msgs[0].data.transactionType).toBe("rollback");
});

test("detects lowercase begin in client query", () => {
  const query = "begin transaction";
  const queryData = Buffer.from(query + "\0");
  const buffer = Buffer.alloc(1 + 4 + queryData.length);
  buffer.writeUInt8("Q".charCodeAt(0), 0);
  buffer.writeUInt32BE(queryData.length + 1, 1);
  queryData.copy(buffer, 5);
  
  const msgs = protocol.parseClientMessage(buffer);
  expect(msgs[0].data.transactionType).toBe("begin");
});

test("does not detect non-transaction query", () => {
  const query = "SELECT 1";
  const queryData = Buffer.from(query + "\0");
  const buffer = Buffer.alloc(1 + 4 + queryData.length);
  buffer.writeUInt8("Q".charCodeAt(0), 0);
  buffer.writeUInt32BE(queryData.length + 1, 1);
  queryData.copy(buffer, 5);
  
  const msgs = protocol.parseClientMessage(buffer);
  expect(msgs[0].data.transactionType).toBeUndefined();
});

test("detects COMMIT in server CommandComplete", () => {
  const tag = "COMMIT";
  const tagData = Buffer.from(tag + "\0");
  const buffer = Buffer.alloc(1 + 4 + tagData.length);
  buffer.writeUInt8("C".charCodeAt(0), 0);
  buffer.writeUInt32BE(tagData.length + 1, 1);
  tagData.copy(buffer, 5);
  
  const msgs = protocol.parseServerMessage(buffer);
  expect(msgs.length).toBe(1);
  expect(msgs[0].type).toBe("CommandComplete");
  expect(msgs[0].data.tag).toBe(tag);
  expect(msgs[0].data.transactionType).toBe("commit");
});

test("detects ROLLBACK in server CommandComplete", () => {
  const tag = "ROLLBACK";
  const tagData = Buffer.from(tag + "\0");
  const buffer = Buffer.alloc(1 + 4 + tagData.length);
  buffer.writeUInt8("C".charCodeAt(0), 0);
  buffer.writeUInt32BE(tagData.length + 1, 1);
  tagData.copy(buffer, 5);
  
  const msgs = protocol.parseServerMessage(buffer);
  expect(msgs[0].data.transactionType).toBe("rollback");
});

test("does not detect non-transaction in server CommandComplete", () => {
  const tag = "SELECT 1";
  const tagData = Buffer.from(tag + "\0");
  const buffer = Buffer.alloc(1 + 4 + tagData.length);
  buffer.writeUInt8("C".charCodeAt(0), 0);
  buffer.writeUInt32BE(tagData.length + 1, 1);
  tagData.copy(buffer, 5);
  
  const msgs = protocol.parseServerMessage(buffer);
  expect(msgs[0].data.transactionType).toBeUndefined();
});