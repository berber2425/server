const   base64 =  {
    encode(buffer: Buffer) {
        return buffer.toString('base64')
    },
    decode(str: string) {
        return Buffer.from(str, 'base64')
    },
    encodeUrl(str: string) {
        return Buffer.from(str).toString('base64url')
    },
    decodeUrl(str: string) {
        return Buffer.from(str, 'base64url')
    }
}

export { base64 };
