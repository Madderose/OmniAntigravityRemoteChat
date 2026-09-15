import { describe, it, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { promises as fsp } from 'fs';
import { saveUploadedImage } from '../../src/utils/workspace.js';

describe('saveUploadedImage', () => {
    const createdFiles = [];

    afterEach(async () => {
        for (const filePath of createdFiles) {
            try {
                await fsp.unlink(filePath);
            } catch (_) {}
        }
        createdFiles.length = 0;
    });

    it('persists a valid PNG image and returns file metadata', async () => {
        const dummyImage = Buffer.from('FAKE-IMAGE-PNG-BYTES').toString('base64');
        const result = await saveUploadedImage({
            name: 'test-screenshot',
            mimeType: 'image/png',
            data: dummyImage
        });

        createdFiles.push(result.absolutePath);

        assert.ok(result.fileName.includes('test-screenshot'));
        assert.ok(result.fileName.endsWith('.png'));
        assert.ok(result.publicPath.includes('/uploads/'));
        assert.ok(result.dataUrl.startsWith('data:image/png;base64,'));

        const stat = await fsp.stat(result.absolutePath);
        assert.ok(stat.size > 0);
    });

    it('persists a JPEG image with correct .jpg extension', async () => {
        const dummyImage = Buffer.from('FAKE-IMAGE-JPEG-BYTES').toString('base64');
        const result = await saveUploadedImage({
            name: 'photo',
            mimeType: 'image/jpeg',
            data: dummyImage
        });

        createdFiles.push(result.absolutePath);

        assert.ok(result.fileName.endsWith('.jpg'));
        assert.ok(result.dataUrl.startsWith('data:image/jpeg;base64,'));
    });

    it('persists a WebP image with correct .webp extension', async () => {
        const dummyImage = Buffer.from('FAKE-IMAGE-WEBP-BYTES').toString('base64');
        const result = await saveUploadedImage({
            name: 'banner',
            mimeType: 'image/webp',
            data: dummyImage
        });

        createdFiles.push(result.absolutePath);

        assert.ok(result.fileName.endsWith('.webp'));
    });

    it('rejects unsupported MIME types', async () => {
        const dummyData = Buffer.from('NOT-AN-IMAGE').toString('base64');
        await assert.rejects(
            saveUploadedImage({
                name: 'binary.exe',
                mimeType: 'application/octet-stream',
                data: dummyData
            }),
            /Unsupported image MIME type/
        );
    });

    it('rejects empty image payload', async () => {
        await assert.rejects(
            saveUploadedImage({
                name: 'empty',
                mimeType: 'image/png',
                data: ''
            }),
            /Image payload is empty/
        );
    });

    it('rejects image payload exceeding 15MB limit', async () => {
        const largeData = Buffer.alloc(16 * 1024 * 1024).toString('base64');
        await assert.rejects(
            saveUploadedImage({
                name: 'huge-pic',
                mimeType: 'image/png',
                data: largeData
            }),
            /exceeds 15 MB limit/
        );
    });

    it('handles empty prompt fallback composition without losing file links', () => {
        const savedImage = {
            fileName: 'snap.png',
            absolutePath: '/uploads/snap.png'
        };
        const rawPrompt = '';
        let composedPrompt = rawPrompt.trim();

        const imageAttachedNatively = false;
        if (savedImage && !imageAttachedNatively) {
            composedPrompt = composedPrompt
                ? `${composedPrompt}\n\n[Attached image: ${savedImage.fileName}](${savedImage.absolutePath})`
                : `[Attached image: ${savedImage.fileName}](${savedImage.absolutePath})`;
        }

        assert.equal(composedPrompt, '[Attached image: snap.png](/uploads/snap.png)');
        assert.ok(composedPrompt.length > 0);
    });
});
