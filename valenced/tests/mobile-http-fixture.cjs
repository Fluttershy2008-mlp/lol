'use strict';

// Models the mobile client's request contract, then serializes and parses real
// multipart bytes with Node's Fetch implementation. No Discord request is made.
// Source for .send(body), .field(name,value) and .attach(name,file,filename):
// https://github.com/Wumpus-Central/discord-mobile-datamining/blob/ba7734c84fbed39fde47c4aa3fc16e106fe90915/discord_common/js/packages/http-utils/HTTPUtils.tsx
// Sticker fields/attachment descriptors:
// https://github.com/Wumpus-Central/discord-mobile-datamining/blob/ba7734c84fbed39fde47c4aa3fc16e106fe90915/discord_app/modules/stickers/StickersActionCreators.tsx
async function mobileStickerRequest(input, readFile) {
    let body, headers;
    if (input.body != null) {
        body = JSON.stringify(input.body); headers = { 'content-type': 'application/json' };
    } else {
        body = new FormData();
        for (const field of input.fields ?? []) body.append(field.name,String(field.value));
        for (const attachment of input.attachments ?? []) {
            const file = attachment.file, bytes = await readFile(file.uri);
            body.append(attachment.name,new Blob([bytes],{ type: file.type }),attachment.filename ?? file.name);
        }
    }
    const sent = new Request('http://localhost/stickers',{ method: 'POST',body,headers });
    const bytes = Buffer.from(await sent.arrayBuffer()), contentType = sent.headers.get('content-type');
    let form;
    if (contentType.startsWith('multipart/form-data; boundary=')) {
        form = await new Request(sent.url,{ method: 'POST',body: bytes,headers: sent.headers }).formData();
    }
    const missing = ['name','tags','file'].filter(field => !form?.get(field));
    if (missing.length) return { response: { status: 400,body: { code: 50035,message: 'Invalid Form Body',
        errors: Object.fromEntries(missing.map(field => [field,{ _errors: [{ code: 'BASE_TYPE_REQUIRED',message: 'This field is required.' }] }])) } },bytes,contentType };
    return { form,bytes,contentType };
}
module.exports = { mobileStickerRequest };
