export const ACCOUNT_DELETE_STORAGE_BATCH_SIZE = 500;

export type AccountDeleteDependencies = {
  userId?: string;
  listPrivateObjectKeys(userId: string): Promise<string[]>;
  removePrivateObjects(objectKeys: string[]): Promise<void>;
  deleteUser(userId: string): Promise<void>;
};

function error(code: string, status: number) {
  return Response.json({ error: { code } }, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export async function handleAccountDelete(
  request: Request,
  dependencies: AccountDeleteDependencies,
): Promise<Response> {
  if (!dependencies.userId) return error('unauthorized', 401);
  if (request.method !== 'POST') return error('method_not_allowed', 405);
  const userId = dependencies.userId;
  try {
    const objectKeys = await dependencies.listPrivateObjectKeys(userId);
    const prefix = `${userId}/`;
    if (new Set(objectKeys).size !== objectKeys.length
      || objectKeys.some((objectKey) => !objectKey.startsWith(prefix))) {
      return error('cleanup_unavailable', 503);
    }
    for (let offset = 0; offset < objectKeys.length; offset += ACCOUNT_DELETE_STORAGE_BATCH_SIZE) {
      await dependencies.removePrivateObjects(
        objectKeys.slice(offset, offset + ACCOUNT_DELETE_STORAGE_BATCH_SIZE),
      );
    }
    await dependencies.deleteUser(userId);
    return new Response(null, {
      status: 204,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch {
    return error('deletion_unavailable', 503);
  }
}
