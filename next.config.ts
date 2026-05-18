import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 접속일보 사진 업로드: 10MB/장 허용 (서버 액션 default 는 1MB).
  // 한 장씩 순차 업로드라 단일 요청 한도만 올리면 됨.
  experimental: {
    serverActions: {
      bodySizeLimit: '12mb',
    },
  },
};

export default nextConfig;
