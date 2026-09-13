import type { SoloStageId } from '../game/data/soloStages.ts'
export interface StageStory {
  time: string
  title: string
  visitor: string
  item: string
  setting: string
  lines: readonly { speaker: string; text: string }[]
}
export const STAGE_STORIES: Partial<Record<SoloStageId, StageStory>> = {
  1: {time:'오후 4:10',title:'아직 그리지 않은 얼굴',visitor:'미루 · 학생',item:'스케치북',setting:'젖은 운동화가 문 앞에서 멈춘다. 아이는 접힌 우산을 두 손으로 쥐고 있다.',lines:[
    {speaker:'미루',text:'스케치북을 두고 왔어요. 앞에는 낙서밖에 없는데… 맨 뒤는 비워뒀거든요.'},
    {speaker:'보관원',text:'맨 뒤에는 뭘 그리려고요?'},
    {speaker:'미루',text:'오늘 데리러 오는 사람요. 늦어도 꼭 온댔어요.'},
  ]},
  2: {time:'오후 5:00',title:'한 사람 몫을 더',visitor:'도윤 · 급식실 직원',item:'우유',setting:'문이 열리자 비 냄새 사이로 따뜻한 밥 냄새가 섞인다. 직원은 비에 젖은 앞치마 끝을 짠다.',lines:[
    {speaker:'도윤',text:'아이 하나가 아직 밖에서 기다리더라고요. 우유라도 주려는데 제 가방도 같이 사라졌네요.'},
    {speaker:'보관원',text:'스케치북 찾던 아이 말인가요? 아직 처마 밑에 있어요.'},
    {speaker:'도윤',text:'가방 찾으면 두 개 챙겨갈게요. 기다리는 건 같이 하는 게 덜 춥잖아요.'},
  ]},
  3: {time:'오후 6:20',title:'돌아가는 방향',visitor:'은재 · 여행객',item:'나침반',setting:'여행 가방 바퀴가 바닥에 긴 물자국을 남긴다. 손님은 벽시계를 보고 휴대전화를 뒤집는다.',lines:[
    {speaker:'은재',text:'나침반이요. 길 찾는 데 쓰진 않아요. 아버지가 여행 갈 때마다 챙겨주셨거든요.'},
    {speaker:'보관원',text:'오늘도 멀리 가시나요?'},
    {speaker:'은재',text:'아뇨. 이번엔 집이요. 늦는다고 전화부터 해야겠네요.'},
  ]},
  4: {time:'오후 7:05',title:'응원석에 놓인 것',visitor:'정호 · 전직 코치',item:'운동화',setting:'닫힌 체육관 쪽에서 호루라기 소리가 한 번 울린다. 흰 머리의 손님이 빈 신발주머니를 펼친다.',lines:[
    {speaker:'정호',text:'운동화를 놓고 왔어요. 십 년 만에 뛰었더니 신발보다 제가 먼저 집에 가려 했나 봐요.'},
    {speaker:'보관원',text:'경기는 잘 끝났어요?'},
    {speaker:'정호',text:'졌죠. 그래도 손녀가 다음에도 와 달래요. 그러니 이 신발이 한 번은 더 필요하겠어요.'},
  ]},
  5: {time:'오후 8:30',title:'불을 조금 더 켜두기',visitor:'은재와 미루',item:'별가루',setting:'빗소리가 잦아든다. 문 앞에 큰 여행 가방과 작은 우산이 나란히 서 있다.',lines:[
    {speaker:'은재',text:'미안, 많이 기다렸지. 나침반 찾으러 왔다가 네가 여기 있다는 말을 들었어.'},
    {speaker:'미루',text:'괜찮아. 우유도 마셨어. 그런데 마지막 장에 그릴 사람이 늘었어.'},
    {speaker:'보관원',text:'그럼 불은 조금 더 켜둘게요. 아직 돌아올 물건도 남았으니까.'},
  ]},
}
