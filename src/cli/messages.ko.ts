// 사용자에게 보이는 CLI 문구(한국어). 키 집합은 messages.en.ts 와 같아야 한다.
import type { en } from './messages.en.js';

export const ko: Record<keyof typeof en, string> = {
  'help.text': `사용법: uimessage-migrate <input.json|input.jsonl ...> [옵션]

저장된 Vercel AI SDK 대화 기록(v4 메시지, v5/v6 parts)을 현재 UIMessage 형식으로 옮기고,
프로젝트에 설치된 "ai" 패키지로 결과를 검증하며, 옮겨지거나 추정되거나 소실된 항목을 모두 보고합니다.

입력: JSON(배열 또는 객체 하나) 또는 JSONL(한 줄에 메시지 하나, 또는
"messages" 배열을 가진 대화 하나).

옵션:
  --out <파일>                 옮긴 기록을 JSONL 로 저장
  --failed <파일>              옮기지 못한 행 저장(줄 번호, 오류 코드, 원본)
  --report <파일>              기계가 읽는 JSON 보고서 저장
  --dry-run                    옮기고 검증만 한 뒤 요약을 출력하고 파일은 쓰지 않음
  --no-validate                ai 검증기와 모델 메시지 변환을 건너뜀
  --fail-on none|lost|estimated
                               해당 단계 이상의 손실이 있으면 종료 코드 1 (기본 none)
  --incomplete-tool keep|error|drop
                               결과 없는 도구 호출을 유지·output-error 로 변환·제거 (기본 keep)
  --data-role part|drop        role "data" 메시지를 data 파트로 옮기거나 버림 (기본 part)
  --signature-provider <이름>  reasoning 서명을 providerMetadata.<이름>.signature 로 보존
  --messages-key <키>          대화 행에서 메시지 배열이 든 속성 이름 (기본 messages)
  --lang en|ko                 출력 언어 (UIMESSAGE_MIGRATE_LANG, LC_ALL, LC_MESSAGES, LANG 도 사용)
  --help                       이 도움말 표시
  --version                    버전 표시

종료 코드: 0 성공, 1 실패한 행이 있거나 --fail-on 에 걸림, 2 사용법·파일 오류,
3 검증에 쓸 "ai" 패키지를 찾지 못함.`,
  'usage.hint': '사용법은 uimessage-migrate --help 로 확인하세요.',
  'version.line': 'uimessage-migrate {version}',

  'summary.title': 'uimessage-migrate {version}',
  'summary.validator': '검증기: ai@{version} ({source})',
  'summary.validatorSkipped': '검증기: 건너뜀 (--no-validate)',
  'summary.migrated': '옮김 {migrated}/{records} 레코드 (그대로 통과 {passthrough}, 실패 {failed}, 버려진 메시지 {dropped})',
  'summary.losses': '손실: {total}건 (소실 {lost}, 추정 {estimated}, 이동 {moved})',
  'summary.lossRow': '  {count}건 {code} ({severity})',
  'summary.unpaired': '짝 없는 도구 호출: {count}건',
  'summary.unpairedHint': '  검증은 통과하지만 제공자가 결과 없는 도구 호출을 거부할 수 있습니다. --incomplete-tool error 를 써 보세요.',
  'summary.modelConversion': '모델 변환: 성공 {ok}, 오류 {error}, 건너뜀 {skipped}',
  'summary.dryRun': 'dry run: 파일을 쓰지 않았습니다',
  'summary.wrote': '{file} 저장함',
  'summary.failOn': '--fail-on {level}: 해당 단계 이상의 손실 {count}건',
  'summary.failedRows': '실패한 행: {count}건 (실패 파일을 확인하거나 --failed <파일> 로 다시 실행하세요)',
  'warn.aiRange': '경고: ai@{version} 는 지원 범위(>=5 <8) 밖입니다',

  'warn.noRecords': '경고: {files} 에서 레코드를 찾지 못했습니다. 파일이 비어 있지 않은지, 올바르게 내보냈는지 확인하세요.',

  'err.unknownOption': '알 수 없는 옵션입니다: {option}.',
  'err.missingValue': '{option} 옵션에는 값이 필요합니다.',
  'err.badValue': '{option} 의 값 "{value}" 가 올바르지 않습니다. 사용 가능: {allowed}.',
  'err.noInput': '입력 파일이 없습니다. .json 또는 .jsonl 파일을 하나 이상 넘기세요.',
  'err.inputMissing': '입력 파일을 찾을 수 없습니다: {file}. 경로를 확인하세요.',
  'err.inputNotFile': '입력이 파일이 아닙니다: {file}. .json 또는 .jsonl 파일을 넘기세요.',
  'err.noOutput': '쓸 곳이 없습니다. --out <파일>, --report <파일>, --failed <파일> 중 하나를 더하거나 --dry-run 을 쓰세요.',
  'err.aiNotFound': '검증에 쓸 "ai" 패키지를 찾을 수 없습니다. 프로젝트에 설치하거나(npm install ai) --no-validate 를 쓰세요.',
  'err.aiUnusable': '설치된 "ai" 패키지를 검증에 쓸 수 없습니다(버전 5 이상 필요). 업그레이드하거나(npm install ai@latest) --no-validate 를 쓰세요.',
  'err.invalidJsonFile': '{file} 을(를) JSON 으로 읽을 수 없습니다: {reason}. 줄마다 JSON 하나인 파일은 .jsonl 로 두세요.',
  'err.writeFailed': '{file} 을(를) 쓸 수 없습니다: {reason}. 폴더가 있고 쓰기 가능한지 확인하세요.',
  'err.outputIsInput': '{file} 에는 쓸 수 없습니다: 입력 파일 또는 다른 출력과 같은 파일입니다. 원본이 지워지지 않도록 다른 출력 경로를 고르세요.',
  'err.readFailed': '{file} 을(를) 읽을 수 없습니다: {reason}.',
  'err.unexpected': '예상하지 못한 오류: {reason}',
};
