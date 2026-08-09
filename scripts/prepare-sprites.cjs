/**
 * 스프라이트 준비 파이프라인.
 * Node에 이미지 라이브러리가 없어서 headless Chrome을 이미지 처리기로 쓴다.
 *
 * 1) 불투명 픽셀의 경계로 크롭하고 큰 변 256px로 축소
 * 2) 알파 마스크의 윤곽선을 따라 실루엣 폴리곤을 뽑고 단순화
 * 3) 그 폴리곤을 볼록 조각들로 분해해 compound 콜라이더로 쓸 형태로 저장
 *
 * 볼록껍질 하나로 감싸면 비행기 날개 사이나 번개 지그재그 같은 오목한 부분이
 * 메워져서 빈 공간에서 부딪힌다. 그래서 껍질이 아니라 실루엣을 쓴다.
 *
 * 사용법: node scripts/prepare-sprites.cjs
 *   SPRITE_ROOT 환경변수로 원본 폴더들의 상위 경로를 바꿀 수 있다.
 *
 * 새 아트가 오면 원본 PNG를 assets-src/ 아래 폴더에 넣고 SOURCES에 폴더와
 * [파일명, 이름] 쌍을 추가하고 다시 돌린다.
 * 파일명은 생성기가 붙인 것을 그대로 쓰고, 이름이 게임에서 쓰는 식별자다.
 *
 * **원본은 저장소 안(assets-src/)에 둔다.** 예전에는 ~/Downloads에 두었는데,
 * 그 폴더가 정리되면 파이프라인을 다시 돌릴 수 없다 — 조각 수 상한이나 출력 형식처럼
 * 파이프라인 상수를 나중에 다시 조정할 길이 영영 막힌다. 원본 53MB는 그 값을 한다.
 * 산출물만 public/items에 들어가므로 빌드 결과에는 실리지 않는다.
 */
const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright-core')

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const SRC_ROOT = process.env.SPRITE_ROOT ?? path.join(__dirname, '..', 'assets-src')
const OUT_DIR = path.join(__dirname, '..', 'public', 'items')

/**
 * 산출물 형식. 스티커 아트는 알파가 있는 그림이라 형식이 곧 로딩 시간이다 —
 * 타이틀의 "혼자 하기"는 57장을 다 받을 때까지 눌리지 않으므로 그 시간이 곧 첫인상이다.
 * PNG 4.05MB가 WebP q=0.92에서 0.95MB로 줄었다(77% 감소).
 *
 * 손실 압축이지만 충돌 도형은 **원본** 이미지의 알파 마스크에서 뽑으므로 물리에 닿지 않는다.
 * 눈에 보이는 것만 확인하면 된다. 입력은 앞으로도 PNG다 — 바뀌는 것은 출력뿐이다.
 */
const OUT_FORMAT = { mime: 'image/webp', quality: 0.92, ext: '.webp' }
/** 형식을 바꾸기 전에 남아 있던 산출물. 지우지 않으면 쓰이지도 않는 채로 빌드에 실린다 */
const STALE_EXTS = ['.png']

/**
 * 가장 큰 덩이의 이 비율에 못 미치는 떨어진 조각은 버린다.
 * 김이나 반짝임 같은 장식은 걸러내면서 한 쌍으로 그려진 물건은 남기는 값이다.
 */
const SCRAP_RATIO = 0.06

const SOURCES = [
  {
    /*
     * **물건 그림을 통째로 다시 그린 묶음(2026-08-09).** 앞선 네 묶음(CSV1·2·5)을
     * 한 손으로 다시 그리고 CSV3 22종을 새로 더했다. 옛 폴더들은 지웠다 —
     * 같은 물건의 그림이 두 벌 남아 있으면 어느 쪽이 쓰이는지 파일을 열어봐야 안다.
     *
     * 이름은 **기존 것을 그대로 이어받는다.** 파일명이 바뀐 물건이 여섯 있는데
     * (`fried-egg-in-pan`·`fart-smell-cloud`·`round-hand-mirror`·`globe`·
     * `pine-tree-christmas-shape`·`running-shoe`) 새 파일명을 따라가면 `words.ts`의
     * 107줄을 함께 고쳐야 하고, 그 과정에서 하나만 놓쳐도 그 물건이 화면에서 사라진다.
     *
     * 빠뜨린 것 둘:
     * - `051_world_globe.png` — 019_globe와 받침 색만 다른 같은 그림이다. 넣으면
     *   도감에 거의 똑같은 칸이 둘 생긴다
     * - `024_alarm_clock.png` — 알람시계가 둘 왔다(일반·클래식 쌍종형). 히든으로 온
     *   디지털 탁상형이 "쌍종형과 구조가 다르다"를 기준으로 그려졌으므로 쌍종형(013)이
     *   기본이어야 한다
     * - `010_sneakers.png`·`023_pine_tree.png` — 운동화와 소나무도 둘씩 왔다.
     *   **합성 세트 쪽(031·010)을 쓴다.** 소나무는 원뿔형이 아니면 별을 얹어도
     *   크리스마스트리가 되지 않고, 운동화는 레이싱 깃발·금메달과 나란히 서야 한다 —
     *   레시피가 그림으로 읽히려면 형태가 그쪽에 맞아 있어야 한다
     */
    dir: '전체-재작화',
    items: [
      ['001_airplane.png', 'airplane'],  // 비행기 일반
      ['002_lunchbox.png', 'lunchbox'],  // 도시락 일반
      ['003_lightning.png', 'lightning'],  // 번개 일반
      ['004_four_leaf_clover.png', 'four-leaf-clover'],  // 클로버 네잎
      ['005_three_leaf_clover.png', 'three-leaf-clover'],  // 클로버 세잎
      ['006_snail_tucked_in.png', 'snail-tucked-in'],  // 달팽이 웅크린 형태
      ['007_snail_out.png', 'snail-out'],  // 달팽이 나와 있는 형태
      ['008_open_umbrella.png', 'open-umbrella'],  // 우산 펼쳐진 우산
      ['009_folded_umbrella.png', 'folded-umbrella'],  // 우산 접힌 우산
      ['010_open_laptop.png', 'open-laptop'],  // 노트북 열림
      ['011_closed_laptop.png', 'closed-laptop'],  // 노트북 닫힘
      ['012_leaf.png', 'leaf'],  // 나뭇잎 일반 나뭇잎
      ['013_maple_leaf.png', 'maple-leaf'],  // 나뭇잎 단풍잎
      ['014_sausage.png', 'sausage'],  // 소세지 일반
      ['015_octopus_sausage.png', 'octopus-sausage'],  // 소세지 문어 모양
      ['016_highball_cocktail.png', 'highball-cocktail'],  // 칵테일 일반 컵 형태
      ['017_martini_cocktail.png', 'martini-cocktail'],  // 칵테일 삼각형 잔
      ['018_pizza_box.png', 'pizza-box'],  // 피자 피자 박스 형태
      ['019_pizza_slice.png', 'pizza-slice'],  // 피자 삼각형 모양
      ['020_tumbler.png', 'tumbler'],  // 텀블러 일반
      ['021_french_fries.png', 'french-fries'],  // 감자튀김 일반
      ['022_triangle_gimbap.png', 'triangle-gimbap'],  // 삼각김밥 일반
      ['023_tiger_swallowtail.png', 'tiger-swallowtail'],  // 호랑나비 일반
      ['025_christmas_tree.png', 'christmas-tree'],  // 크리스마스 트리 일반
      ['026_sunglasses.png', 'sunglasses'],  // 선글라스 일반
      ['027_cricket.png', 'cricket'],  // 귀뚜라미 일반
      ['028_beer.png', 'beer'],  // 맥주 일반
      ['029_americano.png', 'americano'],  // 아메리카노 일반
      ['001_bicycle.png', 'bicycle'],  // 자전거 일반
      ['002_refrigerator.png', 'refrigerator'],  // 냉장고 일반
      ['003_washing_machine.png', 'washing-machine'],  // 세탁기 드럼형
      ['004_microwave.png', 'microwave'],  // 전자레인지 일반
      ['005_electric_kettle.png', 'electric-kettle'],  // 전기주전자 일반
      ['007_rubber_gloves.png', 'rubber-gloves'],  // 고무장갑 한 쌍
      ['008_shampoo_bottle.png', 'shampoo-bottle'],  // 샴푸통 펌프형
      ['009_school_backpack.png', 'school-backpack'],  // 책가방 일반
      ['011_wool_hat.png', 'wool-hat'],  // 털모자 방울 달린 형태
      ['012_scarf.png', 'scarf'],  // 목도리 일반
      ['013_flashlight.png', 'flashlight'],  // 손전등 일반
      ['014_binoculars.png', 'binoculars'],  // 쌍안경 일반
      ['015_watering_can.png', 'watering-can'],  // 물뿌리개 일반
      ['016_toy_train.png', 'toy-train'],  // 장난감기차 증기기관차형
      ['017_dinosaur_toy.png', 'dinosaur-toy'],  // 공룡인형 티라노사우루스형
      ['018_soccer_ball.png', 'soccer-ball'],  // 축구공 일반
      ['019_badminton_racket.png', 'badminton-racket'],  // 배드민턴채 일반
      ['020_roller_skates.png', 'roller-skates'],  // 롤러스케이트 한 켤레
      ['021_sunflower.png', 'sunflower'],  // 해바라기 일반
      ['022_cactus.png', 'cactus'],  // 선인장 화분형
      ['024_ladybug.png', 'ladybug'],  // 무당벌레 일반
      ['025_squirrel.png', 'squirrel'],  // 다람쥐 일반
      ['026_ice_cream_cone.png', 'ice-cream-cone'],  // 아이스크림 콘 형태
      ['027_fish_bread.png', 'fish-bread'],  // 붕어빵 일반
      ['028_chocolate_donut.png', 'chocolate-donut'],  // 초코도넛 초콜릿 코팅
      ['029_strawberry_milk.png', 'strawberry-milk'],  // 딸기우유 우유갑 형태
      ['001_smartphone.png', 'smartphone'],  // 전화기 스마트폰형
      ['002_desk_phone.png', 'desk-phone'],  // 전화기 버튼형 유선전화
      ['004_digital_camera.png', 'digital-camera'],  // 카메라 디지털카메라
      ['005_vertical_traffic_light.png', 'vertical-traffic-light'],  // 신호등 세로형
      ['007_wired_headphones.png', 'wired-headphones'],  // 헤드폰 유선형
      ['010_mesh_trash_bin.png', 'mesh-trash-bin'],  // 휴지통 망사형
      ['011_tv_remote.png', 'tv-remote'],  // 리모컨 텔레비전용
      ['014_compact_keyboard.png', 'compact-keyboard'],  // 키보드 미니 무선형
      ['016_desktop_speaker.png', 'desktop-speaker'],  // 스피커 탁상용 상자형
      ['017_upright_vacuum.png', 'upright-vacuum'],  // 청소기 스틱형
      ['018_robot_vacuum.png', 'robot-vacuum'],  // 청소기 로봇형
      ['019_tissue_box.png', 'tissue-box'],  // 화장지 각티슈형
      ['020_toilet_paper_roll.png', 'toilet-paper-roll'],  // 화장지 두루마리형
      ['021_handheld_sharpener.png', 'handheld-sharpener'],  // 연필깎이 휴대용
      ['022_crank_sharpener.png', 'crank-sharpener'],  // 연필깎이 손잡이형
      ['023_gooseneck_desk_lamp.png', 'gooseneck-desk-lamp'],  // 탁상조명 목이 휘는 형태
      ['024_shade_desk_lamp.png', 'shade-desk-lamp'],  // 탁상조명 갓 달린 형태
      ['025_fire_extinguisher.png', 'fire-extinguisher'],  // 소화기 일반
      ['026_first_aid_kit.png', 'first-aid-kit'],  // 구급상자 손잡이형
      ['027_wristwatch.png', 'wristwatch'],  // 손목시계 일반
      ['028_laundry_basket.png', 'laundry-basket'],  // 빨래바구니 손잡이형
      ['029_clothes_hanger.png', 'clothes-hanger'],  // 옷걸이 일반
      ['001_sunflower_seed.png', 'sunflower-seed'],  // 씨앗 해바라기 씨앗
      ['002_iron.png', 'iron'],  // 다리미 일반
      ['003_blue_shirt.png', 'blue-shirt'],  // 셔츠 일반
      ['004_burnt_hole_shirt.png', 'burnt-hole-shirt'],  // 구멍 난 셔츠 다리미로 탄 형태
      ['005_egg.png', 'egg'],  // 계란 일반
      ['006_frying_pan.png', 'frying-pan'],  // 프라이팬 일반
      ['007_fried_egg_in_pan.png', 'fried-egg'],  // 계란 프라이 프라이팬에 익힌 형태
      ['008_milk_carton.png', 'milk-carton'],  // 우유 흰 우유팩
      ['009_fart_smell_cloud.png', 'fart-cloud'],  // 방귀 냄새 냄새 구름
      ['010_pine_tree_christmas_shape.png', 'pine-tree'],  // 소나무 크리스마스트리형 수형
      ['011_gold_star.png', 'gold-star'],  // 별 트리 꼭대기 별
      ['012_crescent_moon.png', 'crescent-moon'],  // 달 초승달
      ['013_alarm_clock.png', 'alarm-clock'],  // 알람시계 클래식 쌍종형
      ['014_sunlight.png', 'sunlight'],  // 햇빛 아침 햇살
      ['015_rice_plant.png', 'rice-plant'],  // 벼 이삭 한 포기
      ['016_salmon_fish.png', 'salmon-fish'],  // 생선 연어형
      ['017_salmon_sushi.png', 'salmon-sushi'],  // 초밥 연어초밥
      ['018_round_hand_mirror.png', 'hand-mirror'],  // 거울 둥근 손잡이형
      ['019_globe.png', 'desk-globe'],  // 지구본 탁상형
      ['020_mirror_ball.png', 'mirror-ball'],  // 미러볼 매달린 구형
      ['021_window.png', 'window'],  // 창문 닫힌 유리창
      ['022_baseball_bat.png', 'baseball-bat'],  // 야구 배트 나무 배트
      ['023_glass_shards.png', 'glass-shards'],  // 유리조각 깨진 창유리
      ['024_heart.png', 'heart'],  // 하트 붉은 하트
      ['025_candle.png', 'candle'],  // 촛불 짧은 양초
      ['026_heart_ring.png', 'heart-ring'],  // 반지 하트 보석 반지
      ['027_rabbit.png', 'rabbit'],  // 토끼 달리기 직전
      ['028_turtle.png', 'turtle'],  // 거북이 걷는 형태
      ['029_racing_flag.png', 'racing-flag'],  // 레이싱 깃발 체크무늬 결승 깃발
      ['031_running_shoe.png', 'sneakers'],  // 운동화 빠른 달리기용
      ['032_gold_medal.png', 'gold-medal'],  // 금메달 달리기 우승
      ['033_old_key.png', 'old-key'],  // 열쇠 보물상자 열쇠
      ['034_treasure_map.png', 'treasure-map'],  // 지도 보물 지도
      ['035_treasure_chest.png', 'treasure-chest'],  // 보물상자 닫힌 모험 상자
      ['036_padlock.png', 'padlock'],  // 자물쇠 작은 일기장 자물쇠
      ['037_quill_feather.png', 'quill-feather'],  // 깃털 필기용 깃펜
      ['038_secret_diary.png', 'secret-diary'],  // 비밀일기 잠긴 깃펜 일기장
      ['039_telescope.png', 'telescope'],  // 망원경 천체 관측용
      ['040_shooting_star.png', 'shooting-star'],  // 별똥별 긴 꼬리 별
      ['041_spaceship.png', 'spaceship'],  // 우주선 탐사 로켓형
      ['042_camera.png', 'camera'],  // 카메라 여행용 카메라
      ['043_footprints.png', 'footprints'],  // 발자국 여행 발자국
      ['044_travel_album.png', 'travel-album'],  // 여행앨범 사진 여행 기록
      ['045_round_glasses.png', 'round-glasses'],  // 안경 둥근 공부 안경
      ['046_study_book.png', 'study-book'],  // 책 두꺼운 공부책
      ['047_graduation_cap.png', 'graduation-cap'],  // 졸업모자 학업 성취
      ['048_broom.png', 'broom'],  // 빗자루 긴 마녀 빗자루
      ['049_stardust.png', 'stardust'],  // 별가루 병에 담긴 별가루
      ['050_magic_wand.png', 'magic-wand'],  // 마법봉 별 장식 마법봉
      ['052_spider_web.png', 'spider-web'],  // 거미줄 둥근 연결망
      ['053_internet_router.png', 'internet-router'],  // 인터넷 공유기 세계 연결 공유기
      ['054_compass.png', 'compass'],  // 나침반 여행 나침반
      ['055_paper_airplane.png', 'paper-airplane'],  // 종이비행기 여행 출발
      ['056_travel_suitcase.png', 'travel-suitcase'],  // 여행가방 모험 여행용
    ],
  },
  {
    /*
     * 히든 26종. 같은 물건의 **다른 형태**라 기본형과 나란히 서야 한다 —
     * 비행기는 여객기와 복엽기, 알람시계는 쌍종형과 디지털이다.
     *
     * 이름은 `기본형-특징`으로 짓는다. 파일명의 `_hidden_`을 빼면 그 꼴이 되고,
     * 도감에서 기본형 옆에 붙여 읽기에도 그편이 낫다.
     */
    dir: '히든',
    items: [
      ['001_airplane_hidden_biplane.png', 'airplane-biplane'],  // 비행기 히든 · 복엽 프로펠러기
      ['002_alarm_clock_hidden_digital.png', 'alarm-clock-digital'],  // 알람시계 히든 · 디지털 탁상형
      ['003_beer_hidden_bottle.png', 'beer-bottle'],  // 맥주 히든 · 병맥주
      ['004_americano_hidden_iced.png', 'americano-iced'],  // 아메리카노 히든 · 아이스 아메리카노
      ['005_bicycle_hidden_folding.png', 'bicycle-folding'],  // 자전거 히든 · 접이식 자전거
      ['006_electric_kettle_hidden_gooseneck.png', 'electric-kettle-gooseneck'],  // 전기주전자 히든 · 구즈넥형
      ['007_toy_train_hidden_bullet_train.png', 'toy-train-bullet-train'],  // 장난감기차 히든 · 고속열차형
      ['008_dinosaur_toy_hidden_triceratops.png', 'dinosaur-toy-triceratops'],  // 공룡인형 히든 · 트리케라톱스형
      ['009_telescope_hidden_spyglass.png', 'telescope-spyglass'],  // 망원경 히든 · 손망원경
      ['010_spaceship_hidden_flying_saucer.png', 'spaceship-flying-saucer'],  // 우주선 히든 · 원반형 비행접시
      ['011_travel_suitcase_hidden_vintage_trunk.png', 'travel-suitcase-vintage-trunk'],  // 여행가방 히든 · 빈티지 가죽 트렁크
      ['012_toy_car_hidden_dump_truck.png', 'toy-car-dump-truck'],  // 장난감자동차 히든 · 덤프트럭형
      ['013_macaron_hidden_bear_face.png', 'macaron-bear-face'],  // 마카롱 히든 · 곰 얼굴형
      ['014_terrarium_hidden_hanging_geometric.png', 'terrarium-hanging-geometric'],  // 테라리움 히든 · 행잉 기하학형
      ['015_cactus_hidden_mexican_character.png', 'cactus-mexican-character'],  // 선인장 히든 · 멕시칸 캐릭터형
      ['016_lunchbox_hidden_bear_omelet_rice.png', 'lunchbox-bear-omelet-rice'],  // 도시락 히든 · 곰돌이 오므라이스형
      ['017_sunglasses_hidden_black_narrow_frame.png', 'sunglasses-black-narrow-frame'],  // 선글라스 히든 · 젠틀몬스터풍 좁은 사각형
      ['018_magic_wand_hidden_winged_star.png', 'magic-wand-winged-star'],  // 마법봉 히든 · 날개 달린 별 원형봉
      ['019_wool_hat_hidden_nordic_earflap.png', 'wool-hat-nordic-earflap'],  // 털모자 히든 · 노르딕 귀덮개형
      ['020_wristwatch_hidden_silver_ultra_smartwatch.png', 'wristwatch-silver-ultra-smartwatch'],  // 손목시계 히든 · 실버 울트라 스마트워치형
      ['021_milk_hidden_vintage_cart.png', 'milk-vintage-cart'],  // 우유 히든 · 빈티지 밀크 카트형
      ['022_ring_hidden_diamond.png', 'ring-diamond'],  // 반지 히든 · 다이아몬드 반지
      ['023_turtle_hidden_sea_turtle.png', 'turtle-sea-turtle'],  // 거북이 히든 · 바다거북
      ['024_map_hidden_world_map.png', 'map-world-map'],  // 지도 히든 · 세계 지도
      ['025_footprints_hidden_dinosaur.png', 'footprints-dinosaur'],  // 발자국 히든 · 공룡 발자국
      ['026_sketchbook_hidden_open_landscape.png', 'sketchbook-open-landscape'],  // 스케치북 히든 · 가로형 열린 그림 스케치북
    ],
  },
  {
    /*
     * 합성 콤보 세트. 재료를 셋에서 여섯까지 모아 하나로 만드는 레시피 17개를 위해
     * 왔다. 결과물이 열일곱이고 새 재료가 열둘이다.
     *
     * 재료 넷 중 하나가 아직 그림이 없는 레시피가 넷 있다(삼각김밥·옷걸이·연필깎이·화장지).
     * 그림이 오기 전까지 그 레시피는 넣지 않는다 — 넣으면 영영 못 만드는 줄이 생긴다.
     */
    dir: '이미지-합성콤보',
    items: [
      /* 새 재료 */
      ['002_racing_toy_car.png', 'toy-car'],
      ['008_pink_chocolate_macaron.png', 'macaron'],
      ['027_butter_biscuit.png', 'biscuit'],
      ['028_glowing_fantasy_mushroom.png', 'mushroom'],
      ['029_purple_crystal_cluster.png', 'crystal'],
      ['012_snowflake.png', 'snowflake'],
      ['015_top_spiral_sketchbook.png', 'sketchbook'],
      ['016_boxed_colored_pencil_set.png', 'pencil-set'],
      ['018_bubble_solution_bottle.png', 'bubble-bottle'],
      ['020_handheld_portable_fan.png', 'hand-fan'],
      ['021_straw_kids_water_bottle.png', 'kids-bottle'],
      ['025_wooden_door.png', 'wooden-door'],
      /* 합성 결과물 */
      ['001_world_travel_passport.png', 'travel-passport'],
      ['003_speed_course.png', 'speed-course'],
      ['004_space_travel_poster.png', 'space-poster'],
      ['005_explorer_badge.png', 'explorer-badge'],
      ['006_picnic_basket.png', 'picnic-basket'],
      ['007_pub_platter.png', 'pub-platter'],
      ['009_dessert_tower.png', 'dessert-tower'],
      ['010_lucky_flowerpot.png', 'lucky-flowerpot'],
      ['011_fantasy_terrarium.png', 'terrarium'],
      ['013_christmas_snow_globe.png', 'snow-globe'],
      ['014_korean_clothing_repair_shop.png', 'repair-shop'],
      ['017_art_academy_bag.png', 'art-bag'],
      ['019_bathroom_cleaning_set.png', 'cleaning-set'],
      ['022_desert_survival_kit.png', 'survival-kit'],
      ['023_sports_day_trophy.png', 'sports-trophy'],
      ['024_magic_secret_book.png', 'magic-book'],
      ['026_magic_door_in_mirror.png', 'mirror-door'],
    ],
  },
]
const FILES = SOURCES.flatMap(({ dir, items }) =>
  items.map(([file, name]) => [path.join(dir, file), name]),
)

const ALPHA_THRESHOLD = 100
const MAX_SIZE = 256
/** 윤곽선 단순화 강도 — 크기 대비 비율 */
const SIMPLIFY_RATIO = 0.012
/**
 * 윤곽선 점 수 상한.
 *
 * 44였을 때 거북이·별똥별·학사모·별가루가 정확히 44에서 멈췄다 — 더 정밀해질 수 있는데
 * 상한이 막고 있던 것이다. 점 수는 조각 수를 통해서만 물리에 값을 매기므로
 * (콜라이더 비용은 조각이 정한다) 여기를 넉넉히 두고 조각 쪽에서 조인다.
 *
 * **64에서 96으로 올린 것은 눈 결정 때문이다.** 여섯 갈래가 가늘어 윤곽이 60점에서
 * 막혔고, 갈래 끝이 잘려 실루엣이 87%로 문턱(90%) 아래였다 — 화면에는 보이는데
 * 부딪히지 않는 유령이 13%였다는 뜻이다. 96에서 93%, 140에서 96%가 된다.
 * 96을 고른 것은 문턱을 넘기면서 전체 조각 수가 13%만 느는 자리라서다.
 */
const MAX_OUTLINE_POINTS = 96
/**
 * 조각 수 상한. 우산 캐노피처럼 물결진 윤곽은 오목한 꼭짓점이 많아 조각이 불어난다.
 * 상한에 걸리면 볼록껍질로 때우면서 정확도를 잃으므로, 그 전에 윤곽선을 더 단순화해
 * 조각 수를 TARGET_PIECES 아래로 떨어뜨린다.
 *
 * **40에서 64로 올린 것도 눈 결정 때문이다.** 39개로 상한에 붙어 볼록껍질로 때우느라
 * 조각이 윤곽 밖으로 6.7% 부풀었다(상한 1%). 풀어주니 99.8%로 내려왔다.
 * 콜라이더 비용은 실측으로 무시할 수준이다 — 물건 15개·조각 456개에서 스텝 0.134ms다.
 */
const MAX_PIECES = 64
const TARGET_PIECES = 24

const processInPage = ([
  dataUrl,
  maxSize,
  alphaThreshold,
  simplifyRatio,
  maxOutlinePoints,
  maxPieces,
  targetPieces,
  scrapRatio,
  outMime,
  outQuality,
]) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onerror = () => reject(new Error('image load failed'))
    img.onload = () => {
      try {
        resolve(run(img))
      } catch (error) {
        reject(error)
      }
    }
    img.src = dataUrl

    function run(image) {
      const w = image.naturalWidth
      const h = image.naturalHeight
      const src = document.createElement('canvas')
      src.width = w
      src.height = h
      const sctx = src.getContext('2d')
      sctx.drawImage(image, 0, 0)
      const data = sctx.getImageData(0, 0, w, h).data

      const opaque = (x, y) =>
        x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] >= alphaThreshold

      /*
       * 떨어져 있는 작은 부스러기를 버린다.
       *
       * 아메리카노 그림에는 컵 위로 김이 세 가닥 떠 있다. 크롭 상자는 모든 불투명
       * 픽셀로 잡히는데 윤곽선 추적은 "가장 위 왼쪽 픽셀"에서 시작하므로, 김 한 가닥만
       * 따라 그리고 끝난다 — 그림은 컵까지 포함한 크기로 그려지는데 충돌 도형은 김
       * 조각 하나가 된다. 눈에는 물건이 허공에서 부딪히는 것으로 보인다.
       *
       * 반대로 큰 덩어리는 버리면 안 된다. 고무장갑 한 쌍이나 운동화 한 켤레처럼
       * 두 덩이가 다 필요한 물건이 있다. 그래서 가장 큰 덩이의 일정 비율에 못 미치는
       * 것만 버리고, 남은 것을 제대로 감쌌는지는 아래 maskCoverage가 검사한다.
       */
      const label = new Int32Array(w * h).fill(-1)
      const sizes = []
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          if (!opaque(x, y) || label[y * w + x] >= 0) continue
          const id = sizes.length
          let count = 0
          const stack = [x, y]
          label[y * w + x] = id
          while (stack.length > 0) {
            const py = stack.pop()
            const px = stack.pop()
            count += 1
            for (let dy = -1; dy <= 1; dy += 1) {
              for (let dx = -1; dx <= 1; dx += 1) {
                const nx = px + dx
                const ny = py + dy
                if (!opaque(nx, ny) || label[ny * w + nx] >= 0) continue
                label[ny * w + nx] = id
                stack.push(nx, ny)
              }
            }
          }
          sizes.push(count)
        }
      }
      if (sizes.length === 0) throw new Error('no opaque pixels')

      const biggest = Math.max(...sizes)
      const keep = sizes.map((n) => n >= biggest * scrapRatio)
      const dropped = sizes.filter((n, i) => !keep[i]).length
      const solid = (x, y) => {
        if (!opaque(x, y)) return false
        return keep[label[y * w + x]]
      }

      let minX = w
      let minY = h
      let maxX = -1
      let maxY = -1
      let maskPixels = 0
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          if (solid(x, y)) {
            maskPixels += 1
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
        }
      }
      if (maxX < 0) throw new Error('no opaque pixels')

      const cropW = maxX - minX + 1
      const cropH = maxY - minY + 1

      /*
       * ── 1~3. 덩어리마다 따로 윤곽을 뽑고 볼록 조각으로 나눈다 ───────────
       *
       * 윤곽선 추적은 한 점에서 출발해 이어진 경계만 따라간다. 그래서 예전에는
       * 물건 전체를 한 번만 훑었고, 떨어져 있는 덩어리가 여럿이면 **그중 하나만**
       * 도형이 됐다 — 햇빛의 광선 여덟 개 중 왼쪽 위 하나만 잡혀 실루엣이 3%까지
       * 떨어졌다. 나머지는 화면에 보이면서 아무것도 부딪히지 않는 유령이 된다.
       *
       * 콜라이더는 어차피 볼록 조각의 묶음이므로 덩어리가 이어져 있을 이유가 없다.
       * 덩어리마다 따로 훑어 조각을 모으면 흩어진 그림도 그대로 쓸 수 있다.
       *
       * 조각 상한은 물건 하나의 값이다(콜라이더 비용이 조각 수를 따른다). 덩어리가
       * 여럿이면 넓이에 비례해 나눠 가진다 — 큰 덩어리가 세밀함을 더 가져간다.
       */
      const boxes = new Map()
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          if (!solid(x, y)) continue
          const id = label[y * w + x]
          const box = boxes.get(id)
          if (box === undefined) {
            boxes.set(id, { minX: x, minY: y, maxX: x, maxY: y, count: 1 })
            continue
          }
          box.count += 1
          if (x < box.minX) box.minX = x
          if (x > box.maxX) box.maxX = x
          if (y < box.minY) box.minY = y
          if (y > box.maxY) box.maxY = y
        }
      }
      // 큰 덩어리부터 — 조각 예산을 넉넉한 쪽이 먼저 가져간다
      const blobs = [...boxes.entries()]
        .map(([id, box]) => ({ id, ...box }))
        .sort((a, b) => b.count - a.count)

      /*
       * 후보 윤곽을 칠해볼 자리. 물건 하나에 후보가 아홉 × 덩어리 수만큼 나오므로
       * 캔버스는 한 번만 만들고 매번 지워 쓴다.
       */
      const fit = document.createElement('canvas')
      fit.width = w
      fit.height = h
      const fitCtx = fit.getContext('2d', { willReadFrequently: true })
      fitCtx.fillStyle = '#fff'

      const outlines = []
      const pieces = []
      for (const blob of blobs) {
        const share = blob.count / maskPixels
        const blobMaxPieces = Math.max(3, Math.round(maxPieces * share))
        const blobTargetPieces = Math.max(3, Math.round(targetPieces * share))
        const blobSolid = (x, y) => solid(x, y) && label[y * w + x] === blob.id
        const outline = traceContour(blobSolid, blob.minX, blob.minY, blob.maxX, blob.maxY)
        if (outline.length < 4) continue

        /*
         * 단순화 강도를 물건마다 고른다.
         *
         * 예전에는 외접 사각형 크기로 강도를 한 번 정하고, 조각이 너무 많을 때만
         * 더 뭉갰다. 그러면 가는 부분이 있는 그림에서 그 부분이 통째로 뭉개진다 —
         * 벼는 잎이 가늘어 실루엣이 89%까지 떨어지고, 남은 윤곽이 휘어 있어 볼록
         * 조각이 오목한 안쪽까지 먹으며 114%로 부풀었다. 강도가 한 방향으로만
         * 움직일 수 있어서 되돌릴 길이 없었다.
         *
         * 그래서 여러 강도를 다 재보고 가장 나은 것을 고른다. 보는 것은 셋이다 —
         * 그림인데 윤곽 밖으로 밀려난 정도(miss), 그림이 아닌데 윤곽 안에 들어온
         * 정도(bulge), 조각이 윤곽 밖으로 부푼 정도(spill). 부푸는 쪽이 더 나쁘다.
         */
        const blobW = blob.maxX - blob.minX + 1
        const blobH = blob.maxY - blob.minY + 1
        const baseTolerance = Math.max(1, Math.min(blobW, blobH) * simplifyRatio)

        /*
         * 후보 윤곽을 **실제로 칠해서** 그림과 겹쳐본다.
         *
         * 예전에는 넓이 비율만 봤다(윤곽 넓이 ÷ 마스크 픽셀 수). 그러면 모양이 틀려도
         * 넓이만 맞으면 만점이다 — 한쪽이 부풀고 다른 쪽이 패이면 서로 상쇄되기
         * 때문이다. 보물지도가 6각형으로, 고무장갑이 손가락 없는 8각형으로 뽑힌 것이
         * 그래서다. 둘 다 넓이는 거의 정확했다.
         *
         * 그래서 넓이가 아니라 **겹침**을 잰다. 그림인데 윤곽 밖으로 밀려난 픽셀(miss)과
         * 그림이 아닌데 윤곽 안에 들어온 픽셀(bulge)을 따로 센다. 상쇄되지 않으므로
         * 모양이 틀리면 반드시 점수에 남는다.
         *
         * 큰 덩어리는 몇 픽셀 건너뛰며 센다. 재는 것이 비율이라 표본이 성겨도 값이
         * 흔들리지 않고, 후보마다 픽셀을 전부 훑으면 물건 하나에 수백만 번이 된다.
         */
        const step = Math.max(1, Math.floor(Math.min(blobW, blobH) / 256))
        const overlapOf = (poly) => {
          fitCtx.clearRect(0, 0, w, h)
          fitCtx.beginPath()
          fitCtx.moveTo(poly[0][0] + 0.5, poly[0][1] + 0.5)
          for (let i = 1; i < poly.length; i += 1) {
            fitCtx.lineTo(poly[i][0] + 0.5, poly[i][1] + 0.5)
          }
          fitCtx.closePath()
          fitCtx.fill()
          const filled = fitCtx.getImageData(blob.minX, blob.minY, blobW, blobH).data
          let inside = 0
          let miss = 0
          let bulge = 0
          for (let y = 0; y < blobH; y += step) {
            for (let x = 0; x < blobW; x += step) {
              const painted = filled[(y * blobW + x) * 4 + 3] > 127
              const real = blobSolid(blob.minX + x, blob.minY + y)
              if (real) inside += 1
              if (real && !painted) miss += 1
              else if (!real && painted) bulge += 1
            }
          }
          if (inside === 0) return { miss: 1, bulge: 1 }
          return { miss: miss / inside, bulge: bulge / inside }
        }

        let best = null
        for (const factor of [0.15, 0.25, 0.4, 0.6, 1, 1.45, 2.1, 3.05, 4.4, 6.4]) {
          let tolerance = baseTolerance * factor
          let candidate = simplify(outline, tolerance)
          while (candidate.length > maxOutlinePoints) {
            tolerance *= 1.25
            candidate = simplify(outline, tolerance)
          }
          if (candidate.length < 3) continue
          if (area(candidate) < 0) candidate.reverse()
          const attemptPieces = decompose(candidate, blobMaxPieces)
          if (attemptPieces.length === 0) continue
          const outlineArea = Math.abs(area(candidate))
          if (outlineArea === 0) continue
          const { miss, bulge } = overlapOf(candidate)
          const spill =
            attemptPieces.reduce((sum, p) => sum + Math.abs(area(p)), 0) / outlineArea
          const score =
            /*
             * 부푸는 쪽에 벌점을 두 배 준다. 그림에 없는 곳에서 부딪히는 것은 눈으로
             * 알아챌 수 없기 때문이다 — 사라진 쪽은 통과하는 것이 보이기라도 한다.
             */
            miss +
            bulge * 2 +
            Math.abs(spill - 1) * 2 +
            /*
             * 조각은 콜라이더 비용이라 적을수록 좋지만, 그것은 **동점일 때만** 갈라야
             * 한다. 처음에 조각당 0.004를 물렸더니 정확도를 팔아 조각을 줄이는 쪽이
             * 이겨서 기존 물건들이 통째로 뭉개졌다(고무장갑 16→3, 감자튀김 17→4).
             * 조각 하나가 실루엣 오차 0.4%와 맞바꿔지는 값이었다.
             */
            attemptPieces.length * 0.0005 +
            (attemptPieces.length > blobTargetPieces ? 0.03 : 0)
          if (best === null || score < best.score) {
            best = { simplified: candidate, pieces: attemptPieces, score }
          }
        }
        if (best === null) continue
        const simplified = best.simplified
        const split = best.pieces
        outlines.push(simplified)
        pieces.push(...split)
      }
      if (outlines.length === 0) throw new Error('윤곽선을 하나도 뽑지 못했다')

      const covered = pieces.reduce((sum, p) => sum + Math.abs(area(p)), 0)
      const target = outlines.reduce((sum, o) => sum + Math.abs(area(o)), 0)

      // ── 4. 크롭 박스 기준 -1..1 정규화, y는 위쪽이 + ────────────────────
      const cx = minX + cropW / 2
      const cy = minY + cropH / 2
      const norm = (poly) =>
        poly.map(([x, y]) => [
          Number(((x - cx) / (cropW / 2)).toFixed(4)),
          Number((-(y - cy) / (cropH / 2)).toFixed(4)),
        ])

      /*
       * 반올림에 밀려 꺾인 꼭짓점을 걷어낸다.
       *
       * 정규화하면서 소수점 넷째 자리에서 반올림하는데, 거의 일직선인 꼭짓점은 그
       * 반올림만으로 반대쪽으로 꺾일 수 있다. 픽셀 좌표에서 볼록이어도 파일에 적히는
       * 값은 반올림한 쪽이고 Rapier가 받는 것도 그쪽이다 — 방귀 구름의 한 조각이
       * 실제로 그렇게 오목해졌다(cross +1.7e-5).
       *
       * 거의 일직선인 꼭짓점은 빼도 모양이 사실상 그대로다. 빼고 나면 남은 꼭짓점의
       * 꺾임이 반올림 오차보다 훨씬 커서 부호가 뒤집히지 않는다.
       */
      const COLLINEAR_EPS = 5e-4
      const dropCollinear = (poly) => {
        if (poly.length <= 3) return poly
        const kept = []
        for (let i = 0; i < poly.length; i += 1) {
          const prev = kept.length > 0 ? kept[kept.length - 1] : poly[poly.length - 1]
          const next = poly[(i + 1) % poly.length]
          if (Math.abs(cross(prev, poly[i], next)) < COLLINEAR_EPS) continue
          kept.push(poly[i])
        }
        return kept.length >= 3 ? kept : poly
      }

      const outPieces = pieces.map((piece) => dropCollinear(norm(piece)))

      const scale = Math.min(maxSize / cropW, maxSize / cropH, 1)
      const outW = Math.max(1, Math.round(cropW * scale))
      const outH = Math.max(1, Math.round(cropH * scale))
      const out = document.createElement('canvas')
      out.width = outW
      out.height = outH
      const octx = out.getContext('2d')
      octx.imageSmoothingQuality = 'high'
      octx.drawImage(image, minX, minY, cropW, cropH, 0, 0, outW, outH)

      const encoded = out.toDataURL(outMime, outQuality)
      // 브라우저가 그 형식을 모르면 조용히 PNG를 돌려준다 — 모르고 지나가면
      // 산출물 확장자와 실제 형식이 어긋나 배포된 뒤에야 드러난다
      if (!encoded.startsWith(`data:${outMime};base64,`)) {
        throw new Error(`${outMime}로 인코딩하지 못했다`)
      }

      return {
        dataUrl: encoded,
        aspect: Number((cropW / cropH).toFixed(4)),
        outW,
        outH,
        outlines: outlines.map((outline) => dropCollinear(norm(outline))),
        pieces: outPieces,
        coverage: Number((covered / target).toFixed(4)),
        /*
         * 추적한 실루엣이 마스크를 얼마나 덮는지.
         *
         * coverage는 조각들이 **윤곽선**을 덮는지만 본다. 그래서 엉뚱한 덩이 하나만
         * 따라 그려도 100%가 나온다 — 아메리카노가 정확히 그랬다. 실제 그림과
         * 대조하는 눈이 하나 더 필요하다.
         *
         * 1을 넘을 수도 있다. 윤곽선은 바깥 경계만 따라가므로 **안쪽 구멍이 메워진다** —
         * 거미줄이 251%였다(가는 줄만 보이는데 꽉 찬 육각형으로 부딪힌다). 그래서
         * 아래위 양쪽을 다 본다.
         */
        maskCoverage: Number(
          (outlines.reduce((sum, o) => sum + polygonArea(o), 0) / maskPixels).toFixed(4),
        ),
        dropped,
        // 픽셀 좌표가 아니라 **파일에 적히는 값**을 검사한다. Rapier가 받는 것이 그쪽이다
        allConvex: outPieces.every(isConvex),
      }
    }

    /** 폴리곤 넓이 (픽셀 단위). 신발끈 공식 */
    function polygonArea(points) {
      let sum = 0
      for (let i = 0; i < points.length; i += 1) {
        const [x1, y1] = points[i]
        const [x2, y2] = points[(i + 1) % points.length]
        sum += x1 * y2 - x2 * y1
      }
      return Math.abs(sum) / 2
    }

    function traceContour(solid, minX, minY, maxX, maxY) {
      // 시작점: 가장 위쪽 행의 가장 왼쪽 불투명 픽셀
      let startX = -1
      let startY = -1
      for (let y = minY; y <= maxY && startX < 0; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          if (solid(x, y)) {
            startX = x
            startY = y
            break
          }
        }
      }
      const dirs = [
        [1, 0],
        [1, 1],
        [0, 1],
        [-1, 1],
        [-1, 0],
        [-1, -1],
        [0, -1],
        [1, -1],
      ]
      const contour = []
      let cx = startX
      let cy = startY
      let dir = 6
      const limit = (maxX - minX + maxY - minY) * 8 + 1000
      for (let step = 0; step < limit; step += 1) {
        contour.push([cx, cy])
        let found = false
        // 이전 방향의 오른쪽부터 시계 반대로 훑는다
        for (let k = 0; k < 8; k += 1) {
          const d = (dir + 6 + k) % 8
          const nx = cx + dirs[d][0]
          const ny = cy + dirs[d][1]
          if (solid(nx, ny)) {
            cx = nx
            cy = ny
            dir = d
            found = true
            break
          }
        }
        if (!found) break
        if (cx === startX && cy === startY && contour.length > 2) break
      }
      return contour
    }

    /** Douglas-Peucker */
    function simplify(points, tolerance) {
      if (points.length <= 3) return points.slice()
      const keep = new Uint8Array(points.length)
      keep[0] = 1
      keep[points.length - 1] = 1
      const stack = [[0, points.length - 1]]
      while (stack.length > 0) {
        const [first, last] = stack.pop()
        let worst = 0
        let index = -1
        for (let i = first + 1; i < last; i += 1) {
          const d = perpendicular(points[i], points[first], points[last])
          if (d > worst) {
            worst = d
            index = i
          }
        }
        if (index >= 0 && worst > tolerance) {
          keep[index] = 1
          stack.push([first, index], [index, last])
        }
      }
      const result = []
      for (let i = 0; i < points.length; i += 1) if (keep[i]) result.push(points[i])
      return result
    }

    function perpendicular(p, a, b) {
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const len = Math.hypot(dx, dy)
      if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
      return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len
    }

    function area(poly) {
      let sum = 0
      for (let i = 0; i < poly.length; i += 1) {
        const [x1, y1] = poly[i]
        const [x2, y2] = poly[(i + 1) % poly.length]
        sum += x1 * y2 - x2 * y1
      }
      return sum / 2
    }

    function cross(o, a, b) {
      return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    }

    function isConvex(poly) {
      if (poly.length < 4) return true
      let sign = 0
      for (let i = 0; i < poly.length; i += 1) {
        const c = cross(
          poly[i],
          poly[(i + 1) % poly.length],
          poly[(i + 2) % poly.length],
        )
        if (Math.abs(c) < 1e-9) continue
        const s = c > 0 ? 1 : -1
        if (sign === 0) sign = s
        else if (s !== sign) return false
      }
      return true
    }

    function segmentsIntersect(p1, p2, p3, p4) {
      const d1 = cross(p3, p4, p1)
      const d2 = cross(p3, p4, p2)
      const d3 = cross(p1, p2, p3)
      const d4 = cross(p1, p2, p4)
      return (
        ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
      )
    }

    /** i-j 대각선이 폴리곤 내부에 온전히 들어있는가 (CCW 가정) */
    function isDiagonal(poly, i, j) {
      const n = poly.length
      if (i === j || (i + 1) % n === j || (j + 1) % n === i) return false
      const a = poly[i]
      const b = poly[j]
      for (let k = 0; k < n; k += 1) {
        const k2 = (k + 1) % n
        if (k === i || k === j || k2 === i || k2 === j) continue
        if (segmentsIntersect(a, b, poly[k], poly[k2])) return false
      }
      // 내부 방향인지: i의 두 이웃이 만드는 쐐기 안에 b가 있어야 한다
      const prev = poly[(i - 1 + n) % n]
      const next = poly[(i + 1) % n]
      const convexVertex = cross(prev, a, next) > 0
      if (convexVertex) {
        return cross(a, b, prev) > 0 && cross(a, b, next) < 0
      }
      return !(cross(a, b, next) > 0 && cross(a, b, prev) < 0)
    }

    /**
     * 오목한 꼭짓점(reflex)을 찾아 대각선으로 잘라내며 볼록 조각들로 나눈다.
     * 자를 곳을 못 찾으면 그 조각만 볼록껍질로 대체한다 (그때만 정확도를 포기).
     */
    /** 이보다 얇은 조각(원본 픽셀 기준)은 버린다 */
    const MIN_PIECE_THICKNESS_PX = 3

    /**
     * 폴리곤의 실질 두께.
     * 면적을 가장 긴 대각선 길이로 나눈 값이라, 대각선으로 누운 얇은 삼각형도 잡아낸다.
     */
    function thickness(poly) {
      let longest = 0
      for (let i = 0; i < poly.length; i += 1) {
        for (let j = i + 1; j < poly.length; j += 1) {
          longest = Math.max(longest, Math.hypot(poly[i][0] - poly[j][0], poly[i][1] - poly[j][1]))
        }
      }
      if (longest === 0) return 0
      return (2 * Math.abs(area(poly))) / longest
    }

    function decompose(poly, maxCount) {
      const output = []
      const queue = [poly]
      while (queue.length > 0) {
        const current = queue.shift()
        if (current.length < 3) continue
        if (output.length + queue.length + 1 >= maxCount || isConvex(current)) {
          output.push(isConvex(current) ? current : convexHull(current))
          continue
        }
        const n = current.length
        let reflex = -1
        for (let i = 0; i < n; i += 1) {
          const prev = current[(i - 1 + n) % n]
          const next = current[(i + 1) % n]
          if (cross(prev, current[i], next) <= 0) {
            reflex = i
            break
          }
        }
        if (reflex < 0) {
          output.push(current)
          continue
        }
        // 가장 균형 있게 나누는 대각선을 고른다
        let bestJ = -1
        let bestScore = -Infinity
        for (let j = 0; j < n; j += 1) {
          if (!isDiagonal(current, reflex, j)) continue
          const size1 = (j - reflex + n) % n
          const size2 = n - size1
          const score = Math.min(size1, size2)
          if (score > bestScore) {
            bestScore = score
            bestJ = j
          }
        }
        if (bestJ < 0) {
          output.push(convexHull(current))
          continue
        }
        const first = []
        for (let k = reflex; ; k = (k + 1) % n) {
          first.push(current[k])
          if (k === bestJ) break
        }
        const second = []
        for (let k = bestJ; ; k = (k + 1) % n) {
          second.push(current[k])
          if (k === reflex) break
        }
        queue.push(first, second)
      }
      // 바늘처럼 얇은 조각은 물리 엔진에서 퇴화 도형이 되어 콜라이더 생성이 실패한다.
      // 바운딩 박스만 보면 대각선으로 누운 얇은 삼각형을 놓치므로 실제 두께를 잰다.
      return output.filter((p) => p.length >= 3 && thickness(p) >= MIN_PIECE_THICKNESS_PX)
    }

    function convexHull(points) {
      const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
      if (pts.length < 3) return pts
      const lower = []
      for (const p of pts) {
        while (
          lower.length >= 2 &&
          cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
        )
          lower.pop()
        lower.push(p)
      }
      const upper = []
      for (let i = pts.length - 1; i >= 0; i -= 1) {
        const p = pts[i]
        while (
          upper.length >= 2 &&
          cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
        )
          upper.pop()
        upper.push(p)
      }
      return lower.slice(0, -1).concat(upper.slice(0, -1))
    }
  })

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox'],
  })
  const page = await (await browser.newContext()).newPage()
  await page.goto('about:blank')

  const summary = []
  for (const [file, name] of FILES) {
    const buffer = fs.readFileSync(path.join(SRC_ROOT, file))
    const dataUrl = 'data:image/png;base64,' + buffer.toString('base64')
    const result = await page.evaluate(processInPage, [
      dataUrl,
      MAX_SIZE,
      ALPHA_THRESHOLD,
      SIMPLIFY_RATIO,
      MAX_OUTLINE_POINTS,
      MAX_PIECES,
      TARGET_PIECES,
      SCRAP_RATIO,
      OUT_FORMAT.mime,
      OUT_FORMAT.quality,
    ])

    const base64 = result.dataUrl.slice(`data:${OUT_FORMAT.mime};base64,`.length)
    const outPath = path.join(OUT_DIR, name + OUT_FORMAT.ext)
    fs.writeFileSync(outPath, Buffer.from(base64, 'base64'))
    const bytes = fs.statSync(outPath).size
    for (const stale of STALE_EXTS) {
      if (stale !== OUT_FORMAT.ext) {
        fs.rmSync(path.join(OUT_DIR, name + stale), { force: true })
      }
    }

    summary.push({ name, ...result, bytes })
    console.log(
      name.padEnd(16),
      (result.outW + 'x' + result.outH).padEnd(9),
      'aspect ' + String(result.aspect).padEnd(7),
      Math.round(bytes / 1024) + 'KB',
      '덩이 ' + String(result.outlines.length).padEnd(2),
      '윤곽 ' + String(result.outlines.reduce((n, o) => n + o.length, 0)).padEnd(3),
      '조각 ' + String(result.pieces.length).padEnd(3),
      '면적 ' + (result.coverage * 100).toFixed(1) + '%',
      '실루엣 ' + (result.maskCoverage * 100).toFixed(0) + '%',
      result.dropped > 0 ? `부스러기 ${result.dropped}개 버림` : '',
      result.allConvex ? '' : '⚠ 볼록하지 않은 조각',
    )
  }

  // 얇은 조각을 버리므로 면적이 100%에서 조금 모자랄 수 있다. 부풀어 오르는 쪽(볼록껍질
  // 대체)이 진짜 문제이므로 상한을 좁게 잡는다.
  /*
   * maskCoverage가 낮으면 그림의 일부만 따라 그린 것이다 — 나머지는 충돌 없이
   * 통과하는 유령이 된다. 볼록 조각으로 나누며 오목한 부분이 조금 깎이므로
   * 100%를 요구하지는 않는다.
   */
  const bad = summary.filter(
    (s) => !s.allConvex || s.coverage < 0.95 || s.coverage > 1.01 || s.maskCoverage < 0.9,
  )
  if (bad.length > 0) {
    throw new Error(
      '분해 검증 실패: ' +
        bad
          .map((s) => `${s.name}(조각 ${s.coverage} / 실루엣 ${s.maskCoverage})`)
          .join(', '),
    )
  }

  const fmt = (poly) => '[' + poly.map(([x, y]) => `[${x}, ${y}]`).join(', ') + ']'
  const lines = [
    '// 이 파일은 scripts/prepare-sprites.cjs가 생성한다. 직접 고치지 말 것.',
    '//',
    '// pieces는 원본 스티커의 알파 마스크에서 뽑은 실루엣을 볼록 조각들로 나눈 것이다.',
    '// 볼록껍질 하나로 감싸면 비행기 날개 사이처럼 빈 공간에서 부딪히므로 실루엣을 쓴다.',
    '//',
    '// 그림이 떨어진 덩어리 여럿으로 이루어질 수 있다(햇빛의 광선, 흩어진 유리조각).',
    '// outlines는 그래서 배열이고, pieces는 모든 덩어리의 조각을 한데 모은 것이다.',
    '',
    'interface SpriteMeta {',
    '  /** 가로 / 세로 비율 */',
    '  readonly aspect: number',
    '  /** 그리기용 실루엣 윤곽선들. 외접 사각형 기준 -1..1, y는 위쪽이 + */',
    '  readonly outlines: readonly (readonly (readonly [number, number])[])[]',
    '  /** 충돌용 볼록 조각들. 좌표계는 outlines와 같다 */',
    '  readonly pieces: readonly (readonly (readonly [number, number])[])[]',
    '}',
    '',
    '/**',
    ' * 산출물 파일의 확장자. 형식을 바꿀 때 코드 쪽을 따라 고치지 않도록 여기서 낸다 —',
    ' * 파이프라인의 OUT_FORMAT 하나만 바꾸면 words.ts가 만드는 경로까지 함께 따라온다.',
    ' */',
    `const SPRITE_EXT = '${OUT_FORMAT.ext}'`,
    '',
    'const SPRITES = {',
  ]
  for (const item of summary) {
    lines.push(`  '${item.name}': {`)
    lines.push(`    aspect: ${item.aspect},`)
    lines.push('    outlines: [')
    for (const outline of item.outlines) {
      lines.push(`      ${fmt(outline)},`)
    }
    lines.push('    ],')
    lines.push('    pieces: [')
    for (const piece of item.pieces) {
      lines.push(`      ${fmt(piece)},`)
    }
    lines.push('    ],')
    lines.push('  },')
  }
  lines.push('} as const satisfies Record<string, SpriteMeta>')
  lines.push('')
  lines.push('type SpriteName = keyof typeof SPRITES')
  lines.push('')
  lines.push('export { SPRITES, SPRITE_EXT }')
  lines.push('export type { SpriteMeta, SpriteName }')
  lines.push('')

  const generated = path.join(__dirname, '..', 'src', 'game', 'data', 'sprites.generated.ts')
  fs.writeFileSync(generated, lines.join('\n'))
  const total = summary.reduce((sum, s) => sum + s.bytes, 0)
  console.log(
    `\n산출물 ${summary.length}장 · ${(total / 1048576).toFixed(2)}MB (${OUT_FORMAT.mime} q=${OUT_FORMAT.quality})`,
  )
  console.log('생성:', path.relative(path.join(__dirname, '..'), generated))
  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
