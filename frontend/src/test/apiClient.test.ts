import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const response = (data: unknown, status = 200) => new Response(JSON.stringify({ success: status < 400, data, error: status >= 400 ? 'rechazado' : undefined }), { status });
beforeEach(() => { vi.resetModules(); vi.stubGlobal('fetch', vi.fn()); });
afterEach(() => vi.unstubAllGlobals());

describe('Authenticated API client', () => {
  it('bootstraps once and includes authorization for note and asset writes', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(response('token')).mockImplementation(async () => response({}));
    const { api } = await import('../api/client');
    await api.saveNote('A.md', '', 'base'); await api.saveAsset('image.png', 'base64');
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/session', '/api/note', '/api/asset']);
    expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer token');
    expect(fetchMock.mock.calls[2][1]?.credentials).toBe('same-origin');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ path: 'A.md', content: '', check_version: true, expected_content: 'base' });
  });
  it('renews a session once after a server restart and surfaces HTTP errors', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(response('old')).mockResolvedValueOnce(response(null, 401))
      .mockResolvedValueOnce(response('new')).mockResolvedValueOnce(response('contents'))
      .mockResolvedValueOnce(response(null, 409));
    const { api } = await import('../api/client');
    expect(await api.readNote('A.md')).toBe('contents');
    expect(new Headers(fetchMock.mock.calls[3][1]?.headers).get('Authorization')).toBe('Bearer new');
    await expect(api.createNote('A.md')).rejects.toMatchObject({ message: 'rechazado', status: 409 });
  });
});
