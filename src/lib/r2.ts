// Cloudflare R2 (S3-compatible) 스토리지 클라이언트.
//
// 배경 (2026-05-25 owner 요청): 사진 200장/일 누적이 예상되어 Supabase Storage
//   무료 한도 1GB 를 빠르게 초과. Cloudflare R2 가 Egress 무료 + 저장 단가 저렴
//   (~$0.015/GB·월) 해서 비용 효율적. S3-compatible 이라 AWS SDK 그대로 사용.
//
// 권한 모델:
//   - R2 는 service-key 기반 (Access Key/Secret) → 우리 server-side 만 접근
//   - 사용자 권한 검증은 server action 에서 Supabase RLS 로 metadata 행 권한
//     확인한 뒤 통과해야 R2 호출. signed URL 도 server action 이 게이트키퍼.
//
// 환경변수 (.env.local + Vercel):
//   R2_ACCOUNT_ID         Cloudflare 계정 ID (R2 dashboard 우하단)
//   R2_ENDPOINT           https://{account-id}.r2.cloudflarestorage.com
//   R2_ACCESS_KEY_ID      R2 API token 의 Access Key ID
//   R2_SECRET_ACCESS_KEY  R2 API token 의 Secret Access Key
//
// 버킷 (Cloudflare 에서 미리 생성):
//   connection-photos             접속일보 사진
//   leave-attachments             휴가 첨부
//   relocation-field-inspections  지장이설 실사 캡처
//   relocation-facility-photos    청약 시설별 작업사진 (마이그 0078)

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

let _client: S3Client | null = null

function client(): S3Client {
  if (_client) return _client
  const endpoint = process.env.R2_ENDPOINT
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'R2 env vars not set: R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY',
    )
  }
  _client = new S3Client({
    region: 'auto', // R2 는 region 무관, 'auto' 권장
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: false, // R2 는 virtual-hosted style 지원 (S3 기본)
  })
  return _client
}

/**
 * R2 에 파일 업로드.
 * 권한 확인은 호출자(server action) 에서 RLS 등으로 먼저 처리해야 함.
 */
export async function r2Upload(
  bucket: string,
  key: string,
  body: ArrayBuffer | Uint8Array | Buffer,
  contentType?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const cmd = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body instanceof ArrayBuffer ? new Uint8Array(body) : body,
      ContentType: contentType,
    })
    await client().send(cmd)
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}

/**
 * 단일 객체의 signed URL 발급. 만료 후엔 접근 불가.
 * downloadFilename 이 주어지면 응답 헤더에 Content-Disposition: attachment 설정
 *   (브라우저가 파일명으로 다운로드).
 */
export async function r2SignedUrl(
  bucket: string,
  key: string,
  expiresInSec: number,
  downloadFilename?: string,
): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentDisposition: downloadFilename
      ? `attachment; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`
      : undefined,
  })
  return await getSignedUrl(client(), cmd, { expiresIn: expiresInSec })
}

/**
 * 여러 path 에 대해 동시 signed URL 발급 — Supabase 의 createSignedUrls 호환.
 * 결과는 path → url 맵.
 */
export async function r2SignedUrls(
  bucket: string,
  keys: string[],
  expiresInSec: number,
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (keys.length === 0) return result
  const urls = await Promise.all(
    keys.map((k) => r2SignedUrl(bucket, k, expiresInSec).then((u) => [k, u] as const).catch(() => null)),
  )
  for (const item of urls) {
    if (item) result.set(item[0], item[1])
  }
  return result
}

/**
 * 객체(들) 삭제. 실패해도 throw 하지 않음 (호출자가 결과 무시).
 */
export async function r2Remove(bucket: string, keys: string[]): Promise<void> {
  if (keys.length === 0) return
  await Promise.all(
    keys.map(async (key) => {
      try {
        await client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
      } catch {
        // intentionally swallowed — DB row 삭제는 이미 끝남, 고아 파일은 정리 작업으로 대응
      }
    }),
  )
}

// 버킷 이름 상수 — 코드 안 다른 곳에서 import 해 사용
export const R2_BUCKETS = {
  CONNECTION_PHOTOS: 'connection-photos',
  LEAVE_ATTACHMENTS: 'leave-attachments',
  RELOCATION_FIELD_INSPECTIONS: 'relocation-field-inspections',
  RELOCATION_FACILITY_PHOTOS: 'relocation-facility-photos',
} as const
