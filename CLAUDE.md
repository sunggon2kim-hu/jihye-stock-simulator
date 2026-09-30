# 지혜 부자만들기 미국주식 시뮬레이터 — 프로젝트 인수인계 (Claude Code용)

> 이 파일을 `index.html`과 **같은 폴더**에 두고 그 폴더에서 Claude Code를 실행하세요.
> Claude Code는 `CLAUDE.md`를 자동으로 읽어 프로젝트 맥락으로 사용합니다.

## 1. 프로젝트 개요

- **무엇:** 미국 주식 종목명(한글/영문) 또는 티커를 입력하면 시세·차트·기업지표·뉴스를 불러오고, 매수가 기준 미래 주가 시뮬레이션·뉴스 이벤트 시나리오·모의투자를 할 수 있는 **모바일 웹앱**
- **형태:** 단일 파일 `index.html` (HTML + CSS + JS 모두 포함, 빌드 과정 없음)
- **사용자:** 개인용(한국어 UI, 모바일 우선), 투자 참고용 — 투자 권유 아님
- **현재 상태:** 기능 개발 완료, **웹 배포(GitHub Pages) 미완료** ← 다음 작업

## 2. 파일 구성

```
./
├── index.html     # 앱 전체 (약 84KB)
├── README.md      # 저장소 소개
├── .nojekyll      # GitHub Pages에서 Jekyll 처리 끄기
└── CLAUDE.md      # 이 문서
```

## 3. 외부 의존성

| 항목 | 용도 | 비고 |
|---|---|---|
| Alpha Vantage API (`https://www.alphavantage.co/query`) | 시세·일봉·월봉·기업정보·뉴스·종목검색 | 무료 키 필요, **하루 25회** 제한, CORS 허용 |
| lightweight-charts 4.2.0 (unpkg CDN) | 캔들 차트 | `https://unpkg.com/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js` — v4 API(`addCandlestickSeries` 등) 사용, v5로 올리면 API 변경 필요 |
| Google Fonts | Jua(제목), Noto Sans KR(본문), JetBrains Mono(숫자) | |

- API 키는 코드에 없음. 사용자가 첫 화면에서 입력 → `localStorage`(`ss_key`)에 저장.
- `claude.ai` 아티팩트로는 배포 불가: 아티팩트 페이지는 외부 네트워크가 차단되어 API 호출이 안 됨. **일반 정적 호스팅(GitHub Pages, Netlify 등) 필요.**

## 4. 사용하는 Alpha Vantage 호출 (종목 1개 조회 = 5회)

| function | 용도 | 응답 키 |
|---|---|---|
| `GLOBAL_QUOTE` | 현재가·등락 | `Global Quote` → `05. price`, `09. change`, `10. change percent`, `07. latest trading day` |
| `TIME_SERIES_DAILY` (`outputsize=compact`) | 최근 100거래일 일봉 | `Time Series (Daily)` |
| `TIME_SERIES_MONTHLY_ADJUSTED` | 5년 월봉(장기 시뮬레이션) | `Monthly Adjusted Time Series` → `5. adjusted close`. 실패(프리미엄 응답) 시 `TIME_SERIES_MONTHLY`로 대체 |
| `OVERVIEW` | 기업명·PER·EPS·52주·목표가·베타 | `AnalystTargetPrice`, `PERatio`, `Beta`, `52WeekHigh/Low` 등 |
| `NEWS_SENTIMENT` (`tickers`, `limit=30`, `sort=LATEST`) | 뉴스 + 감성점수 | `feed[].ticker_sentiment[].ticker_sentiment_score`, `relevance_score` |
| `SYMBOL_SEARCH` | 영문 회사명 검색(사전에 없을 때만) | `bestMatches[]` (미국 종목만 필터) |

- 오류 처리: `Error Message` → 잘못된 티커, `Note`/`Information` 단독 → 호출 한도 초과(또는 프리미엄)
- 캐시: 같은 요청은 1시간 `localStorage` 캐시(`ss_c_*`). "새로고침" 버튼은 캐시 무시.

## 5. 화면 구성 (하단 탭바 5개)

1. **시세** — 매수가 입력 → 3개월/6개월/1년/2년/3년 예상 주가 카드, 캔들차트(100일 일봉 / 5년 월봉 전환), 주요 지표, 기업 개요
2. **뉴스** — 관련 뉴스 목록, 관련도 가중 평균 감성점수 게이지, 뉴스를 시나리오 이벤트로 추가
3. **시뮬레이션(가운데 ⭐)** — 매수가·수량·환율 입력, 기간별 예상가 차트(과거 24개월 + 미래 36개월, 로그 스케일), 기간별 카드 + "💡 이렇게 계산된 이유", 예측 근거 목록, 가정 조정 패널
4. **시나리오** — 뉴스 이벤트(예: 실적 서프라이즈 +8%)를 넣은 몬테카를로 2,000회 단기 시뮬레이션, "그때 샀더라면?" 백테스트
5. **모의투자** — 가상 현금 $100,000, 현재가 매수/매도, 보유·거래내역 (`localStorage` `ss_paper`)

기타: 한글 종목 사전(약 140개, `DICT_RAW` — `티커|한글명|별칭,...`), 자동완성, 추천 종목 칩, 다크모드(`ss_theme`), 환율은 사용자가 직접 입력(`ss_fx`).

## 6. 장기 예측 모델 (`projModel()` / `renderProjection()`)

**중요: 아래 가정값은 데이터가 아니라 임의로 정한 값이며 UI에서 조정 가능하다고 명시되어 있음. 이 원칙(모르는 것은 모른다고 표시)을 유지할 것.**

- 입력 요소
  - 과거 성과: 최근 60개월 월간 로그수익률로 연평균 수익률(CAGR) 계산 → 상한 ±35%(가정) 적용
  - 애널리스트 목표가: `AnalystTargetPrice / 현재가 - 1` → **1년차에만** 반영
  - 시장 평균 가정: 연 8%(가정)
  - 뉴스 감성: 가중평균 감성점수 × 20%p(가정) = 연 가산율, **6개월까지만** 반영
  - 변동성 σ: 5년 월간 수익률 표준편차 × √12 (없으면 100일 일간 × √252), 배수 조절 가능
- 계산
  - `E1`(1년차 연수익률) = (과거성과·목표가·시장가정)의 비중 가중평균 (기본 비중 1:1:1)
  - `E2`(2년차 이후) = (과거성과·시장가정) 가중평균
  - 기준가 `median(T) = P0 × (1+E1)^min(T,1) × (1+E2)^max(T−1,0) × (1+감성)^min(T,0.5)`
  - 범위(10~90%) = `median × exp(±1.2816 × σ × √T)`
  - 매수가 이상 확률 = `Φ(ln(median/매수가) / (σ√T))`
- 비조정 월봉을 쓸 때는 월 −45% 이하 수익률을 액면분할로 보고 제외
- 참고용(계산 미반영): PER, 베타, 52주 가격 위치

## 7. 확인된 것 / 확인 못 한 것

- ✅ 가짜(mock) API 응답으로 Playwright 테스트: 모든 탭, 한글 검색·자동완성·복수 후보·영문 검색, 시뮬레이션 계산, 모의투자, 390px 모바일 폭(가로 스크롤 없음), 다크모드 — JS 오류 없음
- ❓ **실제 Alpha Vantage 연결은 미검증** (개발 환경에서 해당 도메인 접속 불가)
- ❓ **실제 lightweight-charts 렌더링 미검증** (테스트는 스텁으로 대체)
- ❓ 무료 키로 `TIME_SERIES_MONTHLY_ADJUSTED` 사용 가능 여부 미확인 (불가 시 비조정 월봉으로 자동 대체)
- ❓ 무료 요금제 시세의 실시간 여부 미확인 (화면에 "기준일" 표시)

## 8. 다음 작업: GitHub Pages 배포

1. GitHub에 **Public** 빈 저장소 생성 (예: `jihye-stock-simulator`)
2. 이 폴더에서:
   ```bash
   git init
   git add index.html README.md .nojekyll CLAUDE.md
   git commit -m "지혜 부자만들기 미국주식 시뮬레이터"
   git branch -M main
   git remote add origin https://github.com/<계정>/<저장소>.git
   git push -u origin main
   ```
3. Pages 켜기 — `gh` CLI가 있으면:
   ```bash
   gh api -X POST repos/<계정>/<저장소>/pages -f "source[branch]=main" -f "source[path]=/"
   ```
   없으면 GitHub 저장소 → **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: main / (root) → Save**
4. 1~2분 뒤 `https://<계정>.github.io/<저장소>/` 접속
5. 배포 후 검증할 것: API 키 입력 → `demo` 키로 IBM 조회 → 실제 키로 AAPL/엔비디아 조회 → 차트 표시, 시뮬레이션 탭, 휴대폰 브라우저에서 확인

## 9. Claude Code에 처음 줄 요청 예시

```
CLAUDE.md를 읽고 이 프로젝트를 GitHub Pages로 배포해줘.
저장소는 <계정>/<저장소>야. 배포 후 실제 Alpha Vantage 데이터와 차트가 잘 나오는지 확인하고,
문제가 있으면 고쳐줘.
```

## 10. 작업 규칙 (사용자 선호)

- UI와 안내 문구는 **한국어**, 모바일 우선
- 데이터로 확인되지 않는 내용은 추측하지 말고 **"모른다/데이터 없음"으로 명시**
- 시뮬레이션의 임의 가정값은 반드시 "가정값"으로 표시하고 사용자가 조정할 수 있게 유지
- 한국식 색상: 상승 빨강, 하락 파랑
- 모든 시뮬레이션 화면에 "참고용, 투자 권유 아님" 고지 유지
