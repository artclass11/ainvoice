interface SecretBox {
  (message: Uint8Array, nonce: Uint8Array, key: Uint8Array): Uint8Array;
  open(ciphertext: Uint8Array, nonce: Uint8Array, key: Uint8Array): Uint8Array | null;
  readonly keyLength: number;
  readonly nonceLength: number;
  readonly overheadLength: number;
}
interface TweetNaCl {
  readonly secretbox: SecretBox;
}
declare const nacl: TweetNaCl;
export default nacl;
