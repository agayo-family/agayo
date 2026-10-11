import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';
const { isUploadPurpose, isUploadPathAllowed, assertUploadFile } = await loadTs('../lib/upload-policy.ts');

test('unrecognised/inherited purposes cannot mint upload permissions', () => {
  for(const value of ['__proto__','constructor','admin',null,{},42]) assert.equal(isUploadPurpose(value),false);
});
test('token path rejects traversal, other-purpose paths and URL schemes', () => {
  for(const value of ['agayo/uploads/photo/../loyalty/a.jpg','agayo/uploads/poster/a.jpg','https://host/a.jpg','agayo/uploads/photo/sub/a.jpg']) assert.equal(isUploadPathAllowed(value,'photo'),false);
  assert.equal(isUploadPathAllowed('agayo/uploads/photo/23-file.jpg','photo'),true);
});
test('direct uploads support a large valid photo while rejecting SVG and oversized/empty files', () => {
  assert.doesNotThrow(()=>assertUploadFile({size:10*1024*1024,type:'image/jpeg'},'photo'));
  assert.throws(()=>assertUploadFile({size:17*1024*1024,type:'image/jpeg'},'photo'));
  assert.throws(()=>assertUploadFile({size:100,type:'image/svg+xml'},'photo'));
  assert.throws(()=>assertUploadFile({size:0,type:'image/jpeg'},'photo'));
});
test('organizer portraits have a separate path and do not accept animated, SVG or oversized uploads', () => {
  assert.equal(isUploadPurpose('organizer'), true);
  assert.equal(isUploadPathAllowed('agayo/uploads/organizer/portrait-a.webp', 'organizer'), true);
  assert.equal(isUploadPathAllowed('agayo/uploads/photo/portrait-a.webp', 'organizer'), false);
  assert.doesNotThrow(() => assertUploadFile({ size: 8 * 1024 * 1024, type: 'image/webp' }, 'organizer'));
  for (const file of [{ size: 10, type: 'image/gif' }, { size: 10, type: 'image/svg+xml' }, { size: 8 * 1024 * 1024 + 1, type: 'image/jpeg' }]) assert.throws(() => assertUploadFile(file, 'organizer'));
});
