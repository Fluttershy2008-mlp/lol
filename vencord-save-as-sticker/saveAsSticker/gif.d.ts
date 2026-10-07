export function isGIF(base64: string): boolean;
export function prepareGIF(base64: string, check?: () => void): Promise<{
    base64: string;
    mimeType: "image/gif";
    extension: "gif";
}>;
export function encodeVideoFrames(count: number, durationMs: number, readFrame: (index: number) => Promise<Uint8ClampedArray>, check?: () => void): Promise<Uint8Array<ArrayBuffer>>;
