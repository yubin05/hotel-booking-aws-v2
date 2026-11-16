# 숙소 사진 이관 스크립트

원본 11장을 640 · 1200 WebP(3:2)로 줄이고, 숙소 · 객실 사진 칸 7,050개에 복사해 서울 S3에 올립니다. 도쿄로는 S3 복제가 옮깁니다. 결정과 근거는 [ADR-055](../../docs/04-decisions.md#adr-055)에 있습니다.

## 원본 받기

원본은 git에 넣지 않습니다(`originals/`는 `.gitignore`). 새 PC에서는 아래 주소를 **브라우저로 직접** 받아 `originals/00.jpg` ~ `10.jpg`로 저장합니다. Unsplash 약관 8절이 스크립트로 내려받는 것을 금지해서입니다. 모두 [Unsplash License](https://unsplash.com/license)입니다.

| 파일 | 출처 | 받는 법 |
|---|---|---|
| 00 | https://images.unsplash.com/photo-1445019980597-93fa8acb246c | 주소 뒤에 `?w=2400&q=90`을 붙여 열고 저장 |
| 01 | https://unsplash.com/photos/lTrbjFd8Iwo (Gabriel Alenius, 객실) | 사진 페이지의 Download |
| 02 | https://images.unsplash.com/photo-1504280390367-361c6d9f38f4 | `?w=2400&q=90` |
| 03 | https://images.unsplash.com/photo-1510798831971-661eb04b3739 | `?w=2400&q=90` |
| 04 | https://unsplash.com/photos/hotel-building-with-balconies-and-palms-_dS27XGgRyQ (Francesca Saraco, 건물) | 사진 페이지의 Download |
| 05 | https://unsplash.com/photos/a-view-of-a-swimming-pool-from-above-TVqbivRSslA (engin akyurt, 수영장) | 사진 페이지의 Download |
| 06 | https://unsplash.com/photos/DJoQwnGdV6s (MARCO, 건물) | 사진 페이지의 Download |
| 07 | https://images.unsplash.com/photo-1571896349842-33c89424de2d | `?w=2400&q=90` |
| 08 | https://images.unsplash.com/photo-1578469645742-46cae010e5d4 | `?w=2400&q=90` |
| 09 | https://images.unsplash.com/photo-1590490360182-c33d57733427 | `?w=2400&q=90` |
| 10 | https://images.unsplash.com/photo-1598928506311-c55ded91a20c | `?w=2400&q=90` |

사진 페이지에서는 오른쪽 위 **Download 버튼**으로 받습니다. 사진 위에서 마우스 오른쪽 → 저장을 하면 화면용 작은 미리보기(AVIF, 폭 700px 안팎)가 받아집니다. 그러면 큰 판이 흐려져서, 원본이 1200×800보다 작으면 `npm run resize`가 멈춥니다(2026-11-16 실제로 겪음).

01 · 04 · 05 · 06은 처음 시드 사진에 사람이 찍혀 있어 바꿨습니다(라이선스는 사진 속 사람 · 상표 · 작품의 권리를 다루지 않음). 사람이 없는 사진인지는 받을 때 눈으로 확인합니다.

## 실행

bootstrap의 복제 설정을 먼저 apply한 뒤 올립니다. 규칙보다 먼저 올린 파일은 도쿄로 복제되지 않습니다.

```bash
cd /c/dev/hotel-booking-aws-v2/scripts/photos
npm ci
npm run resize   # out/src/<번호>/<크기>.webp 22개와 전체 용량
npm run stage    # out/upload/ 에 사진 칸마다 파일 14,100개 (하드 링크)

# 서울 버킷에 올리기 (관리자). 같은 이름은 다시 올리지 않음(sync)
BUCKET=$(cd ../../infra/bootstrap && AWS_PROFILE=admin terraform output -raw photos_bucket)
date; AWS_PROFILE=admin aws s3 sync out/upload "s3://$BUCKET" \
  --content-type image/webp --cache-control "public, max-age=31536000, immutable" --only-show-errors; date
```

- `Cache-Control` 1년: 사진 CloudFront가 이 값을 따라 엣지에 보관합니다. 같은 이름으로 내용을 바꾸면 손님 브라우저에 옛 사진이 남을 수 있어, 바꿀 때는 새 이름으로 올립니다.
- 도쿄 복제가 끝났는지는 두 버킷의 파일 수가 같은지로 확인합니다.
