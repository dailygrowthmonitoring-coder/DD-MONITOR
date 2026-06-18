import { NextResponse }          from 'next/server';
import { createSSRClient }        from '@/lib/db/client-ssr';
import { createServiceRoleClient } from '@/lib/db/client';
import { checkPasswordPolicy }    from '@/lib/auth/passwordPolicy';
import { logger }                 from '@/lib/logger';

async function verifyAdmin() {
  const supabase = await createSSRClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: role } = await supabase.rpc('get_current_user_role');
  if (role !== 'admin') return null;
  return user.id;
}

// PATCH /api/admin/users/[userId] — set role, ban, unban, or reset password
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const callerId = await verifyAdmin();
  if (!callerId) return new NextResponse('Forbidden', { status: 403 });

  const { userId } = await params;

  let body: unknown;
  try { body = await req.json(); } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }
  const { action } = body as Record<string, unknown>;

  const admin = createServiceRoleClient();

  if (action === 'setRole') {
    const { role } = body as Record<string, unknown>;
    if (role !== 'admin' && role !== 'viewer') {
      return new NextResponse('role must be admin or viewer', { status: 400 });
    }
    if (userId === callerId) {
      return new NextResponse('Cannot change your own role', { status: 409 });
    }
    const { error } = await admin
      .from('profiles')
      .update({ role: role as 'admin' | 'viewer' })
      .eq('user_id', userId);
    if (error) {
      logger.error('api/admin/users/[userId]', 'setRole failed', { userId, error: String(error) });
      return new NextResponse('Update failed', { status: 500 });
    }
    logger.info('api/admin/users/[userId]', 'role changed', { userId, role, callerId });
    return new NextResponse(null, { status: 204 });
  }

  if (action === 'ban') {
    if (userId === callerId) {
      return new NextResponse('Cannot ban yourself', { status: 409 });
    }
    const { error } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: '87600h',
    });
    if (error) {
      logger.error('api/admin/users/[userId]', 'ban failed', { userId, error: String(error) });
      return new NextResponse('Ban failed', { status: 500 });
    }
    logger.info('api/admin/users/[userId]', 'user banned', { userId, callerId });
    return new NextResponse(null, { status: 204 });
  }

  if (action === 'unban') {
    const { error } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: 'none',
    });
    if (error) {
      logger.error('api/admin/users/[userId]', 'unban failed', { userId, error: String(error) });
      return new NextResponse('Unban failed', { status: 500 });
    }
    logger.info('api/admin/users/[userId]', 'user unbanned', { userId, callerId });
    return new NextResponse(null, { status: 204 });
  }

  if (action === 'setPassword') {
    const { password } = body as Record<string, unknown>;
    if (typeof password !== 'string') {
      return new NextResponse('password required', { status: 400 });
    }
    const policy = checkPasswordPolicy(password);
    if (!policy.valid) {
      return new NextResponse(
        `Password policy violations: ${policy.violations.map(v => v.message).join(', ')}`,
        { status: 422 },
      );
    }
    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) {
      logger.error('api/admin/users/[userId]', 'setPassword failed', { userId, error: String(error) });
      return new NextResponse('Password update failed', { status: 500 });
    }
    logger.info('api/admin/users/[userId]', 'password reset', { userId, callerId });
    return new NextResponse(null, { status: 204 });
  }

  return new NextResponse('Unknown action', { status: 400 });
}

// DELETE /api/admin/users/[userId] — permanently delete a user
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const callerId = await verifyAdmin();
  if (!callerId) return new NextResponse('Forbidden', { status: 403 });

  const { userId } = await params;

  if (userId === callerId) {
    return new NextResponse('Cannot delete your own account', { status: 409 });
  }

  const admin = createServiceRoleClient();

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    logger.error('api/admin/users/[userId]', 'deleteUser failed', { userId, error: String(error) });
    return new NextResponse('Delete failed', { status: 500 });
  }

  logger.info('api/admin/users/[userId]', 'user deleted', { userId, callerId });
  return new NextResponse(null, { status: 204 });
}
