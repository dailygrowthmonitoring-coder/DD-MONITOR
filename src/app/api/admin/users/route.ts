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

// GET /api/admin/users — list all users with their profiles
export async function GET() {
  const callerId = await verifyAdmin();
  if (!callerId) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const admin = createServiceRoleClient();

  const [authRes, profilesRes] = await Promise.all([
    admin.auth.admin.listUsers(),
    admin.from('profiles').select('user_id, full_name, role'),
  ]);

  if (authRes.error) {
    logger.error('api/admin/users', 'listUsers failed', { error: String(authRes.error) });
    return new NextResponse('Internal error', { status: 500 });
  }

  const profileMap = new Map(
    (profilesRes.data ?? []).map(p => [p.user_id, p]),
  );

  const now = new Date();
  const users = authRes.data.users.map(u => ({
    id:              u.id,
    email:           u.email ?? '',
    full_name:       profileMap.get(u.id)?.full_name ?? null,
    role:            (profileMap.get(u.id)?.role ?? 'viewer') as 'admin' | 'viewer',
    status:          (u.banned_until && new Date(u.banned_until) > now) ? 'locked' : 'active',
    last_sign_in_at: u.last_sign_in_at ?? null,
    created_at:      u.created_at,
  }));

  return NextResponse.json({ users });
}

// POST /api/admin/users — create a new user
export async function POST(req: Request) {
  const callerId = await verifyAdmin();
  if (!callerId) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }

  const { email, full_name, role, password } = body as Record<string, unknown>;

  if (typeof email !== 'string' || !email) {
    return new NextResponse('email required', { status: 400 });
  }
  if (role !== 'admin' && role !== 'viewer') {
    return new NextResponse('role must be admin or viewer', { status: 400 });
  }
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

  const admin = createServiceRoleClient();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr || !created.user) {
    logger.error('api/admin/users', 'createUser failed', { email, error: String(createErr) });
    return new NextResponse(String(createErr?.message ?? 'Create failed'), { status: 500 });
  }

  const userId = created.user.id;

  const { error: profileErr } = await admin.from('profiles').upsert({
    user_id:   userId,
    full_name: typeof full_name === 'string' ? full_name : null,
    role:      role as 'admin' | 'viewer',
  });

  if (profileErr) {
    logger.error('api/admin/users', 'profile upsert failed', { userId, error: String(profileErr) });
  }

  logger.info('api/admin/users', 'user created', { userId, email, role, callerId });
  return NextResponse.json({ id: userId }, { status: 201 });
}
