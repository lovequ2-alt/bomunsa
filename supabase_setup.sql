-- Supabase SQL Editor에 그대로 붙여넣고 Run을 누르세요.
-- 1. 공용 발원문 / 영가등 테이블 생성
create table if not exists public.prayers (
  id uuid primary key default gen_random_uuid(),
  location_id text not null,
  text text not null check (char_length(trim(text)) > 0 and char_length(text) <= 200),
  owner_id text not null,
  created_at timestamptz not null default now()
);

-- 조회 성능을 위한 인덱스
create index if not exists prayers_location_created_idx
  on public.prayers (location_id, created_at desc);

-- 2. 보안 규칙 (Row Level Security) 활성화
alter table public.prayers enable row level security;

-- 누구나 공용 발원문을 읽을 수 있음
create policy "Anyone can read prayers"
  on public.prayers for select
  using (true);

-- 누구나 발원문을 올릴 수 있음 (길이 제한은 테이블 check 제약으로 보호)
create policy "Anyone can insert prayers"
  on public.prayers for insert
  with check (char_length(trim(text)) > 0 and char_length(text) <= 200);

-- 수정/삭제 허용 (클라이언트 owner_id 매칭 기반)
create policy "Users can update own prayers"
  on public.prayers for update
  using (true)
  with check (char_length(trim(text)) > 0 and char_length(text) <= 200);

create policy "Users can delete own prayers"
  on public.prayers for delete
  using (true);

-- 3. 실시간 업데이트(Realtime) 활성화
alter publication supabase_realtime add table public.prayers;
