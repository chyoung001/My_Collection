// 표준 에러 응답 헬퍼.
// 응답 포맷: { error: "snake_case_code", message: "사용자용 한국어 메시지", details?: {...} }
//
// - error는 클라이언트가 분기에 사용하는 안정된 코드 (i18n 키처럼)
// - message는 사용자에게 보여줘도 안전한 설명
// - 내부 스택/SQL/토큰은 절대 details에 넣지 않음

const DEFAULT_MESSAGES = {
  // 공통
  invalid_id:             "유효하지 않은 ID 입니다.",
  invalid_request:        "잘못된 요청입니다.",
  missing_required_fields: "필수 항목이 비어있습니다.",
  not_found:              "찾을 수 없습니다.",
  internal_error:         "서버 오류가 발생했습니다.",
  cors_forbidden:         "허용되지 않은 출처(Origin)에서의 요청입니다.",

  // 인증 / 레이트리밋
  unauthorized:           "인증이 필요합니다. (유효한 API 토큰을 제공하세요)",
  auth_not_configured:    "서버에 API_TOKEN이 설정되지 않아 변경 요청을 처리할 수 없습니다.",
  rate_limited:           "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",

  // 카드
  card_not_found:           "카드를 찾을 수 없습니다.",
  failed_to_create_card:    "카드 등록에 실패했습니다.",
  failed_to_fetch_cards:    "카드 목록을 불러오지 못했습니다.",
  failed_to_fetch_card:     "카드 정보를 불러오지 못했습니다.",
  failed_to_delete_card:    "카드 삭제에 실패했습니다.",
  failed_to_update_image:   "이미지 변경에 실패했습니다.",
  failed_to_update_purchase_price: "구매가 변경에 실패했습니다.",
  invalid_sold_price:       "올바른 판매가 형식이 아닙니다.",
  failed_to_update_sold:    "판매 등록에 실패했습니다.",
  failed_to_unsell:         "판매 취소에 실패했습니다.",
  failed_to_update_rare_flag: "희소 카드 플래그 변경에 실패했습니다.",
  failed_to_assign_section: "갤러리 섹션 할당에 실패했습니다.",
  invalid_purchase_price:   "올바른 구매가 형식이 아닙니다.",
  invalid_isRare:           "isRare는 true/false 여야 합니다.",
  invalid_sectionId:        "유효하지 않은 섹션 ID 입니다.",
  cert_already_exists:      "이미 등록된 Cert 번호 입니다.",

  // 이미지
  missing_imageUrl:           "이미지 URL이 필요합니다.",
  invalid_data_url:           "잘못된 data URL 형식 입니다.",
  invalid_image_url:          "잘못된 이미지 URL 입니다.",
  invalid_base64:             "base64 디코딩에 실패했습니다.",
  unsupported_image_mime:     "지원하지 않는 이미지 형식 입니다. (PNG, JPEG, WebP, GIF만 가능)",
  unsupported_image_protocol: "이미지는 http(s) 또는 data URL 만 허용됩니다.",
  image_too_large:            "이미지 크기는 1MB 이하만 가능합니다.",
  image_magic_mismatch:       "이미지 형식이 일치하지 않습니다.",

  // PSA / 외부
  psa_token_not_configured: "PSA 토큰이 설정되지 않았습니다.",
  only_psa_supported:       "현재 PSA 만 지원합니다.",
  missing_certNumber:       "Cert 번호가 필요합니다.",
  psa_cert_not_found:       "해당 Cert 번호를 PSA에서 찾을 수 없습니다.",
  psa_lookup_failed:        "PSA 조회에 실패했습니다.",

  // 시세
  invalid_card_id:        "유효하지 않은 카드 ID 입니다.",
  rare_card_blocked:      "희소 카드(1/1·SSP)는 자동 시세 수집 신뢰도가 낮습니다. ?force=1로 강제 수집 가능합니다.",
  daily_scrape_limit:     "오늘의 시세 수집 한도에 도달했습니다. 내일 다시 시도해 주세요.",
  scraping_failed:        "시세 수집에 실패했습니다.",
  db_error:               "데이터베이스 오류가 발생했습니다.",
  db_save_error:          "데이터 저장에 실패했습니다.",
  failed_to_fetch_snapshots: "시세 스냅샷을 불러오지 못했습니다.",
  failed_to_fetch_history:   "가격 이력을 불러오지 못했습니다.",
  failed_to_fetch_snapshot_summary: "시세 요약을 불러오지 못했습니다.",

  // 대시보드
  failed_to_fetch_summary:   "요약 정보를 불러오지 못했습니다.",
  failed_to_fetch_top_cards: "상위 카드를 불러오지 못했습니다.",
  failed_to_fetch_top_gainer: "Top Gainer를 불러오지 못했습니다.",
  no_cards_found:            "등록된 카드가 없습니다.",

  // 갤러리
  missing_name:               "이름이 비어있습니다.",
  name_too_long:              "이름이 너무 깁니다. (최대 120자)",
  invalid_frame_layout:       "지원하지 않는 프레임 레이아웃 입니다.",
  invalid_order_array:        "정렬 배열 형식이 잘못됐습니다.",
  invalid_cardIds_array:      "카드 ID 배열 형식이 잘못됐습니다.",
  invalid_section_id:         "유효하지 않은 섹션 ID 입니다.",
  section_not_found:          "갤러리 섹션을 찾을 수 없습니다.",
  no_fields_to_update:        "변경할 항목이 없습니다.",
  failed_to_create_section:   "갤러리 섹션 생성에 실패했습니다.",
  failed_to_update_section:   "갤러리 섹션 수정에 실패했습니다.",
  failed_to_delete_section:   "갤러리 섹션 삭제에 실패했습니다.",
  failed_to_reorder_sections: "섹션 순서 변경에 실패했습니다.",
  failed_to_reorder_cards:    "카드 순서 변경에 실패했습니다.",
  failed_to_add_cards:        "카드 추가에 실패했습니다.",
  frame_full:                 "이 프레임은 가득 찼습니다.",
  frame_too_small:            "현재 카드 수가 새 프레임 슬롯보다 많습니다.",
};

/**
 * Express res 에 표준 에러 응답을 작성한다.
 *
 * @param {import('express').Response} res
 * @param {number} status   HTTP status code
 * @param {string} code     error 코드 (DEFAULT_MESSAGES 키)
 * @param {object} [extra]  details / message override 등
 */
export function sendError(res, status, code, extra = {}) {
  const { message: overrideMessage, ...details } = extra;
  const body = {
    error: code,
    message: overrideMessage || DEFAULT_MESSAGES[code] || "오류가 발생했습니다.",
  };
  if (Object.keys(details).length > 0) {
    body.details = details;
  }
  return res.status(status).json(body);
}
