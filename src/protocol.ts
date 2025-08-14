export interface PostgreSQLMessage {
  type: string;
  length?: number;
  data?: any;
}

export class PostgreSQLProtocol {
  parseServerMessage(buffer: Buffer): PostgreSQLMessage[] {
    const messages: PostgreSQLMessage[] = [];
    let offset = 0;

    while (offset < buffer.length) {
      if (offset >= buffer.length) break;

      const messageType = String.fromCharCode(buffer[offset]);
      const messageLength = buffer.readUInt32BE(offset + 1);
      
      if (offset + messageLength + 1 > buffer.length) {
        break;
      }

      const messageData = buffer.slice(offset + 5, offset + messageLength + 1);
      
      switch (messageType) {
        case 'R':
          const authType = buffer.readUInt32BE(offset + 5);
          if (authType === 0) {
            messages.push({ type: 'AuthenticationOk' });
          } else {
            messages.push({ type: 'AuthenticationRequired', data: { authType } });
          }
          break;
        case 'E':
          messages.push(this.parseErrorResponse(messageData));
          break;
        case 'Z':
          const status = String.fromCharCode(buffer[offset + 5]);
          messages.push({ type: 'ReadyForQuery', data: { status } });
          break;
        case 'T':
          messages.push(this.parseRowDescription(messageData));
          break;
        case 'D':
          messages.push(this.parseDataRow(messageData));
          break;
        case 'C':
          const tag = this.readCString(messageData, 0);
          messages.push({ type: 'CommandComplete', data: { tag } });
          break;
        default:
          console.warn(`Unknown server message type: ${messageType}`);
      }

      offset += messageLength + 1;
    }

    return messages;
  }

  parseClientMessage(buffer: Buffer): PostgreSQLMessage[] {
    const messages: PostgreSQLMessage[] = [];
    let offset = 0;

    while (offset < buffer.length) {
      if (offset === 0 && buffer.length >= 8) {
        const length = buffer.readUInt32BE(0);
        if (length === buffer.length && buffer.readUInt32BE(4) === 0x00030000) {
          const message = this.parseStartupMessage(buffer);
          messages.push(message);
          break;
        }
      }

      if (offset >= buffer.length) break;

      const messageType = String.fromCharCode(buffer[offset]);
      const messageLength = buffer.readUInt32BE(offset + 1);
      
      if (offset + messageLength + 1 > buffer.length) {
        break;
      }

      const messageData = buffer.slice(offset + 5, offset + messageLength + 1);
      
      switch (messageType) {
        case 'Q':
          messages.push(this.parseQuery(messageData));
          break;
        case 'X':
          messages.push({ type: 'terminate' });
          break;
        default:
          console.warn(`Unknown message type: ${messageType}`);
      }

      offset += messageLength + 1;
    }

    return messages;
  }

  private parseStartupMessage(buffer: Buffer): PostgreSQLMessage {
    const params: Record<string, string> = {};
    let offset = 8;

    while (offset < buffer.length - 1) {
      const key = this.readCString(buffer, offset);
      offset += key.length + 1;
      
      if (offset >= buffer.length) break;
      
      const value = this.readCString(buffer, offset);
      offset += value.length + 1;
      
      if (key) params[key] = value;
    }

    return {
      type: 'startup',
      data: params
    };
  }

  private parseQuery(buffer: Buffer): PostgreSQLMessage {
    const query = this.readCString(buffer, 0);
    return {
      type: 'query',
      data: { query }
    };
  }

  private readCString(buffer: Buffer, offset: number): string {
    let end = offset;
    while (end < buffer.length && buffer[end] !== 0) {
      end++;
    }
    return buffer.slice(offset, end).toString('utf8');
  }

  createAuthenticationOk(): Buffer {
    const buffer = Buffer.alloc(9);
    buffer.writeUInt8(0x52, 0); // 'R'
    buffer.writeUInt32BE(8, 1);
    buffer.writeUInt32BE(0, 5);
    return buffer;
  }

  createReadyForQuery(status: string = 'I'): Buffer {
    const buffer = Buffer.alloc(6);
    buffer.writeUInt8(0x5A, 0); // 'Z'
    buffer.writeUInt32BE(5, 1);
    buffer.writeUInt8(status.charCodeAt(0), 5);
    return buffer;
  }

  createCommandComplete(tag: string): Buffer {
    const tagBuffer = Buffer.from(tag + '\0', 'utf8');
    const buffer = Buffer.alloc(5 + tagBuffer.length);
    buffer.writeUInt8(0x43, 0); // 'C'
    buffer.writeUInt32BE(4 + tagBuffer.length, 1);
    tagBuffer.copy(buffer, 5);
    return buffer;
  }

  createErrorResponse(message: string): Buffer {
    const severity = Buffer.from('SFATAL\0', 'utf8');
    const code = Buffer.from('C08006\0', 'utf8');
    const msg = Buffer.from(`M${message}\0`, 'utf8');
    const end = Buffer.from('\0', 'utf8');
    
    const totalLength = severity.length + code.length + msg.length + end.length;
    const buffer = Buffer.alloc(5 + totalLength);
    
    buffer.writeUInt8(0x45, 0); // 'E'
    buffer.writeUInt32BE(4 + totalLength, 1);
    
    let offset = 5;
    severity.copy(buffer, offset);
    offset += severity.length;
    code.copy(buffer, offset);
    offset += code.length;
    msg.copy(buffer, offset);
    offset += msg.length;
    end.copy(buffer, offset);
    
    return buffer;
  }

  createRowDescription(fields: Array<{name: string, type: number}>): Buffer {
    let totalLength = 6; // header + field count
    const fieldBuffers: Buffer[] = [];
    
    for (const field of fields) {
      const nameBuffer = Buffer.from(field.name + '\0', 'utf8');
      const fieldBuffer = Buffer.alloc(nameBuffer.length + 18);
      nameBuffer.copy(fieldBuffer, 0);
      fieldBuffer.writeUInt32BE(0, nameBuffer.length); // table OID
      fieldBuffer.writeUInt16BE(0, nameBuffer.length + 4); // column number
      fieldBuffer.writeUInt32BE(field.type, nameBuffer.length + 6); // type OID
      fieldBuffer.writeInt16BE(-1, nameBuffer.length + 10); // type size
      fieldBuffer.writeInt32BE(-1, nameBuffer.length + 12); // type modifier
      fieldBuffer.writeInt16BE(0, nameBuffer.length + 16); // format code
      
      fieldBuffers.push(fieldBuffer);
      totalLength += fieldBuffer.length;
    }
    
    const buffer = Buffer.alloc(totalLength);
    buffer.writeUInt8(0x54, 0); // 'T'
    buffer.writeUInt32BE(totalLength - 1, 1);
    buffer.writeUInt16BE(fields.length, 5);
    
    let offset = 7;
    for (const fieldBuffer of fieldBuffers) {
      fieldBuffer.copy(buffer, offset);
      offset += fieldBuffer.length;
    }
    
    return buffer;
  }

  private parseErrorResponse(buffer: Buffer): PostgreSQLMessage {
    const fields: Record<string, string> = {};
    let offset = 0;

    while (offset < buffer.length - 1) {
      const fieldType = String.fromCharCode(buffer[offset]);
      offset++;
      
      if (fieldType === '\0') break;
      
      const value = this.readCString(buffer, offset);
      offset += value.length + 1;
      
      fields[fieldType] = value;
    }

    return {
      type: 'ErrorResponse',
      data: {
        severity: fields.S,
        code: fields.C,
        message: fields.M,
        fields
      }
    };
  }

  private parseRowDescription(buffer: Buffer): PostgreSQLMessage {
    const fieldCount = buffer.readUInt16BE(0);
    const fields = [];
    let offset = 2;

    for (let i = 0; i < fieldCount; i++) {
      const name = this.readCString(buffer, offset);
      offset += name.length + 1;
      
      const tableOid = buffer.readUInt32BE(offset);
      offset += 4;
      const columnNumber = buffer.readUInt16BE(offset);
      offset += 2;
      const typeOid = buffer.readUInt32BE(offset);
      offset += 4;
      const typeSize = buffer.readInt16BE(offset);
      offset += 2;
      const typeModifier = buffer.readInt32BE(offset);
      offset += 4;
      const formatCode = buffer.readInt16BE(offset);
      offset += 2;

      fields.push({
        name,
        tableOid,
        columnNumber,
        typeOid,
        typeSize,
        typeModifier,
        formatCode
      });
    }

    return {
      type: 'RowDescription',
      data: { fields }
    };
  }

  private parseDataRow(buffer: Buffer): PostgreSQLMessage {
    const fieldCount = buffer.readUInt16BE(0);
    const fields = [];
    let offset = 2;

    for (let i = 0; i < fieldCount; i++) {
      const fieldLength = buffer.readInt32BE(offset);
      offset += 4;
      
      if (fieldLength === -1) {
        fields.push(null);
      } else {
        const fieldData = buffer.slice(offset, offset + fieldLength);
        fields.push(fieldData.toString('utf8'));
        offset += fieldLength;
      }
    }

    return {
      type: 'DataRow',
      data: { fields }
    };
  }

  createStartupMessage(params: Record<string, string>): Buffer {
    const protocolVersion = Buffer.alloc(4);
    protocolVersion.writeUInt32BE(0x00030000, 0);

    const paramBuffers: Buffer[] = [];
    let totalParamLength = 0;

    for (const [key, value] of Object.entries(params)) {
      const keyBuffer = Buffer.from(key + '\0', 'utf8');
      const valueBuffer = Buffer.from(value + '\0', 'utf8');
      paramBuffers.push(keyBuffer, valueBuffer);
      totalParamLength += keyBuffer.length + valueBuffer.length;
    }

    const endBuffer = Buffer.from('\0', 'utf8');
    const totalLength = 4 + 4 + totalParamLength + 1; // length + protocol + params + end

    const message = Buffer.alloc(totalLength);
    message.writeUInt32BE(totalLength, 0);
    protocolVersion.copy(message, 4);

    let offset = 8;
    for (const paramBuffer of paramBuffers) {
      paramBuffer.copy(message, offset);
      offset += paramBuffer.length;
    }
    endBuffer.copy(message, offset);

    return message;
  }

  createSSLRequestMessage(): Buffer {
    const buffer = Buffer.alloc(8);
    buffer.writeInt32BE(8, 0);
    buffer.writeInt32BE(80877103, 4); // SSLRequest code
    return buffer;
  }

  isSSLRequest(buffer: Buffer): boolean {
    if (buffer.length !== 8) {
      return false;
    }
    const length = buffer.readInt32BE(0);
    const code = buffer.readInt32BE(4);
    return length === 8 && code === 80877103;
  }

  createQueryMessage(query: string): Buffer {
    const queryBuffer = Buffer.from(query + '\0', 'utf8');
    const message = Buffer.alloc(5 + queryBuffer.length);
    
    message.writeUInt8(0x51, 0); // 'Q'
    message.writeUInt32BE(4 + queryBuffer.length, 1);
    queryBuffer.copy(message, 5);
    
    return message;
  }
}