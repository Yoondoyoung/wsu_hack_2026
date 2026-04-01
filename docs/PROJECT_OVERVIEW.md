# WSU-2026 프로젝트 개요

Salt Lake City 일대 **Zillow 스타일 매물 데이터**를 기반으로 한 대시보드: **Mapbox 지도**, **레이어 오버레이**, **매물 리스트·상세**, **범죄 인접도(서버 계산)**, **모기지 승인 ML 예측**을 포함한다.

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| 프론트 | React (Vite), TypeScript, Tailwind, Mapbox GL (`react-map-gl`), Axios |
| 백엔드 | Express (TypeScript, `tsx`), 포트 **3001** |
| 프록시 | Vite dev 서버 **5173** → `/api` → `localhost:3001` |

---

## 디렉터리 구조 (요약)

```
client/          # React 앱
  src/
    components/  # Layout, LeftPanel, CenterPanel(MapView), RightPanel, ConnectionLine
    hooks/       # useProperties, useMapState
    services/    # api.ts (fetchProperties, fetchOverlay, predictMortgage)
    types/       # property, mortgage, map
    utils/       # formatters, crimeRisk
server/          # Express API
  src/
    routes/      # properties.ts, mortgage.ts
    data/
      houseList/           # salt-lake-city-for-sale.enriched.json (Zillow enrich)
      overlays/            # crime_slc.json, *.geojson, structures polygons
      schools/             # salt-lake-city-best-schools.geocoded.json
    model/                 # loan_approval_model_slc.pkl (ML)
server/ml/       # FastAPI mortgage predictor (localhost:8000, Express가 프록시)
```

---

## 구현된 기능

### 클라이언트

- **레이아웃**: 중앙 전체 지도 + 좌측 오버레이/뷰 모드 + 우측 매물 리스트/아코디언 상세.
- **지도**: 기본/위성/3D(피치), 매물 **가격 컴팩트 라벨** 마커, 선택 시 `flyTo` + 선택 마커–카드 **연결선** (SVG).
- **성능**: 뷰포트 밖 마커는 렌더 생략, “N of M listings in view” 표시.
- **필터**: 가격 범위, 최소 학교 점수(리스트·지도 동일 `filteredProperties`).
- **오버레이** (토글): crime, schools, population, noise, structures — heatmap 또는 벡터/GeoJSON.
  - **structures**: `geojson-vt`로 생성한 **벡터 타일** (`/overlays/structures/tiles/{z}/{x}/{y}.pbf`).
- **상세 패널**: 사진 캐러셀, 주소·가격·bed/bath/sqft, **범죄 리스크 배지**, Zillow 원문 링크.
- **AI Mortgage Predictor**: 소득·부채·대출·다운·신용점수 입력 → 승인 확률 게이지 (ML 또는 서버 폴백).

### 서버

- **`GET /api/properties`**: 로컬 enriched JSON 로드 → 매물 배열 + **범죄 enrich** 후 캐시.
- **`GET /api/properties/overlays/:type`**: `crime` | `schools` | `population` | `noise` | `structures` — GeoJSON FeatureCollection (structures는 별도 타일).
- **`GET /api/properties/overlays/structures/tiles/:z/:x/:y.pbf`**: 건물 폴리곤 MVT.
- **`POST /api/predict-mortgage`**: 바디를 Python ML 서비스(`http://localhost:8000/predict`)로 전달; 실패 시 **휴리스틱** 응답.

### ML (선택 실행)

- `server/ml/main.py`: `joblib`로 `loan_approval_model_slc.pkl` 로드, HMDA 스타일 입력으로 분류.

---

## API 응답: `Property` (핵심 필드)

클라이언트 [`client/src/types/property.ts`](../client/src/types/property.ts)와 서버 `loadProperties` 매핑이 일치한다.

| 필드 | 설명 |
|------|------|
| `id` | `zpid` 문자열 |
| `address`, `streetAddress`, `city`, `state`, `zip` | 표시·필터용 |
| `price` | 리스트 가격 |
| `beds`, `baths`, `sqft`, `yearBuilt` | 스크래핑·detail 폴백 |
| `coordinates` | `[lng, lat]` |
| `homeType`, `description`, `lotSize`, `pricePerSqft` | 상세 |
| `daysOnZillow`, `pageViews`, `favorites` | 메타 |
| `heating`, `cooling`, `parking`, `appliances`, `constructionMaterials` | 문자열 배열 |
| `basement` | 문자열 또는 null |
| `brokerName`, `agentName`, `agentPhone` | 중개 |
| `hoaFee` | `detail.monthlyHoaFee` (월, null 가능) |
| `zestimate`, `rentZestimate` | `detail` (null 가능) |
| `schools[]` | `name`, `rating`, `distance`, `level`, `type`, `link` |
| `priceHistory[]` | `date`, `event`, `price`, `source` |
| `statusText`, `flexText` | 리스트 상태, 플렉스 필드(예: “Quiet” 배지 힌트) |
| `crimeIncidentCount` | **0.5 mi** 반경 내 사건 점 개수 |
| `crimeRiskRadiusMiles` | 현재 **0.5** |
| `crimeRiskLevel` | `'low' \| 'medium' \| 'high'` — **동일 배치 내 삼분위** |

---

## 소스 데이터: `salt-lake-city-for-sale.enriched.json`

루트 객체(예시):

- `source`, `scope`, `searchUrl`, `pagesProcessed`, `resultCountReported`, `listingCount`
- `listings[]`: 각 항목은 Zillow **search 카드** + **detail** 페이지 병합 형태.

**리스트/원시에 자주 쓰는 필드** (서버 매핑 기준):

| 소스 경로 (개념) | 용도 |
|------------------|------|
| `zpid`, `address`, `price`, `beds`, `baths`, `sqft`, `latitude`, `longitude`, `detailUrl` | 코어 |
| `raw.hdpData.homeInfo` | 좌표·침실·타입 등 폴백 |
| `raw.carouselPhotosComposable` | 썸네일 URL |
| `detail` | 이미지, `schools`, `priceHistory`, `monthlyHoaFee`, `zestimate`, `rentZestimate`, `yearBuilt`, `description`, `propertyTypeDimension` 등 |
| `detail.images` | 상세 사진 URL |
| `agentName`, `agentPhone` | 에이전트 |

**아직 API `Property`에 올리지 않은 detail 예시** (JSON에는 존재할 수 있음): `taxHistory`, `taxAssessedValue`, `monthlyHoaFee` 외 HOA 문자열 등 — 필요 시 `server/src/routes/properties.ts`의 `loadProperties`에서 추가 매핑하면 된다.

---

## 범죄 데이터 (`crime_slc.json`)

- Esri 레플리카 형식: `layers[0].features[]` — `geometry.x`, `geometry.y`는 **Utah Central (NAD83, US feet)**.
- 서버에서 `proj4`로 WGS84 변환 후 Haversine 카운트 및 오버레이 GeoJSON 생성.
- **피처 속성 예**: `crime_type`, `crime`, `division`, `date_t` 등.

---

## 학교 오버레이 (`salt-lake-city-best-schools.geocoded.json`)

- `schools[]` 레코드 → Point GeoJSON.
- `longitude`/`latitude`가 있으면 실좌표, 없으면 **SLC 중심 기준 시드 해시로 의사 좌표** (`pseudoSchoolCoordinates`).

---

## 기타 오버레이 GeoJSON

- `population.geojson`, `noise.geojson`, `structures.geojson` 등 — `server/src/data/overlays/`에 파일명과 `type`이 대응.
- **structures** 폴리곤은 대용량 GeoJSON을 `geojson-vt`로 타일링.

---

## 모기지 API

- **요청** [`MortgageRequestPayload`](../client/src/types/mortgage.ts): `loan_amount`, `property_value`, `income`(천 달러), `debt_to_income_ratio`(구간 문자열), `loan_type`, `loan_purpose`, `loan_term`, `applicant_age`, `applicant_sex`, `occupancy_type`.
- **응답**: `approved`, `confidence`, `message`.
- UI의 `computePayload`는 일부 필드를 **고정값**으로 보낼 수 있음 — 폼과 페이로드 정합은 개선 여지 있음.

---

## 환경 변수

- 클라이언트: `VITE_MAPBOX_TOKEN` (Mapbox).
- ML 서버 URL: 기본 `http://localhost:8000` (`server/src/routes/mortgage.ts`).

---

## 실행 (참고)

- 백엔드: `cd server && npm run dev` (또는 `build` + `start`).
- 프론트: `cd client && npm run dev`.
- ML: `server/ml`에서 FastAPI 앱 실행 (프로젝트 스크립트는 README/패키지 확인).

---

*문서 생성 시점 기준으로 코드와 일치하도록 유지할 것. 데이터 필드 추가 시 본 문서와 `property.ts`를 함께 갱신하는 것을 권장한다.*
