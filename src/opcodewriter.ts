export class OpcodeWriter {
    start: number
    opcodes: number[] = []
  
    constructor(start: number) {
      this.start = start
    }
  
    get offset() {
      return this.start + this.opcodes.length
    }
  
    write(opcodes: number | number[]) {
      if (Array.isArray(opcodes)) {
        this.opcodes.push(...opcodes)
      } else {
        this.opcodes.push(opcodes)
      }
    }
  
    writePush(value: number) {
      if (value > 255) {
        this.write(0x68) // PUSH int32
        const buffer = Buffer.alloc(4)
        buffer.writeUInt32LE(value)
        this.write([...buffer])
      } else {
        this.write(0x6a) // PUSH int8
        this.write(value)
      }
    }
  
    writeCall(destination: number, args: number[] = []) {
      if (args.length > 0) {
        const argsReversed = [...args].reverse()
        argsReversed.forEach(arg => {
          this.writePush(arg)
        })
      }
  
      const offset = this.offset
      this.write(0xE8) // CALL
      const buffer = Buffer.alloc(4)
      buffer.writeInt32LE(destination - offset - 5)
      this.write([...buffer])
      if (args.length > 0) {
        this.write([0x83, 0xC4]) // ADD ESP, int8
        this.write(args.length * 4)
      }
    }
  
    writeStart() {
      this.write([0x55, 0x8B, 0xEC]) // PUSH EBP; MOV EBP,ESP
    }

    writeReturn() {
      this.write([0x5D, 0xC3]) // POP EBP ; RET
    }
  
    toBuffer() {
      return Buffer.from(this.opcodes)
    }
  }