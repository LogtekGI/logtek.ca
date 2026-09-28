/* Logtek — « Les cernes » (page À propos / About)
   Le moment signature de la page : l'icône du pin, dans la carte « Basé à », descend dans la moelle
   et le tronc pousse, cerne par cerne, au rythme de l'histoire du fondateur (défilement de .story-text).
   Chaque cerne se dépose en faisant le tour, comme le cambium qui ajoute une année ; l'écorce suit la
   croissance. En fin de lecture, la bille est tronçonnée (passe du guide, marques de scie, fentes de
   séchage), puis l'écorce s'ouvre et durcit, sommet par sommet, en la roue dentée du logo Logtek.
   - Géométrie calculée une seule fois (générateur pseudo-aléatoire à graine fixe : FR et EN identiques).
   - La roue dentée finale est la vraie forme du logo (assets/img/logo.svg, même tracé, même bronze).
   - Tâche LTK.fx active seulement quand la carte est à l'écran et que la progression change ;
     on n'écrit que des attributs SVG internes (aucune propriété de mise en page).
   - Mouvement réduit : état final fixe (la bille complète dont l'écorce est déjà la roue dentée).
   - Sans JS : l'icône du pin d'origine. Décor aria-hidden ; le texte de l'histoire ne change pas.
   Dépend de fx-core.js (window.LTK). */
(function () {
  "use strict";
  var L = window.LTK;
  var card = document.querySelector(".story-card");
  var icon = card && card.querySelector(".story-card > svg.ic.big");
  var story = document.querySelector(".story-text");
  if (!L || !L.fx || !icon || !story) return;

  var NS = "http://www.w3.org/2000/svg";
  var TAU = Math.PI * 2, PI = Math.PI;
  var lang = (document.body.getAttribute("data-lang") || document.documentElement.lang || "fr").slice(0, 2);
  var clamp = L.clamp, lerp = L.lerp, out3 = L.ease.out3, inOut3 = L.ease.inOut3;

  /* ---------- hasard reproductible ---------- */
  var seed = 0x4c7e4b;
  function rnd() {
    seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  function hash(k) { var x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function f1(v) { return Math.round(v * 10) / 10; }

  /* ---------- calendrier du défilement (p = 0…1) ---------- */
  var P0 = .04,   // le pin descend dans la moelle
      PG = .6,    // fin de la croissance
      PC = .74;   // fin du tronçonnage ; ensuite l'écorce devient la roue dentée (pendant la citation)

  /* ---------- cernes ---------- */
  var N = 24, M = 160;
  var R = [], W = [], acc = 0, k, i;
  for (k = 0; k < N; k++) { W[k] = Math.exp(-k / 13) * (.5 + 1 * hash(k + 1)); acc += W[k]; R[k] = acc; }
  var norm = 96 / R[N - 1];
  for (k = 0; k < N; k++) { R[k] *= norm; W[k] *= norm; }
  var HK = 0; while (R[HK] < .55 * 96) HK++;
  var wMin = Math.min.apply(null, W), wMax = Math.max.apply(null, W);
  var TH0 = Math.atan2(-3, 5) + PI;          // la moelle est décalée vers (−5, +3) : les cernes s'étirent à l'opposé
  var AMP = [], PH = [];
  for (var m = 2; m <= 4; m++) { AMP[m] = (.012 + .008 * rnd()) * (m === 2 ? .55 : .42); PH[m] = rnd() * TAU; }
  var PH7 = rnd() * TAU;
  // rayon du cerne k à l'angle th (autour de la moelle) ; phases corrélées d'un cerne à l'autre : ça lit comme du bois
  function ringR(k, th) {
    var r = 1 + .10 * (k + 1) / N * Math.cos(th - TH0);
    for (var m = 2; m <= 4; m++) r += AMP[m] * Math.sin(m * th + PH[m] + .07 * k);
    r += .0035 * Math.sin(7 * th + PH7 + .31 * k) + .0025 * Math.sin(11 * th + PH7 * 2 - .23 * k);
    return R[k] * r;
  }
  // angle de départ du balayage : vers midi, un peu différent à chaque année
  var START = []; for (k = 0; k < N; k++) START[k] = -PI / 2 + (hash(k + 40) - .5) * .7;
  function ringPts(k, n, th0, inset) {
    var a = []; for (var i = 0; i < n; i++) { var th = th0 + TAU * i / n, r = ringR(k, th) - (inset || 0); a.push(r * Math.cos(th), r * Math.sin(th)); }
    return a;
  }
  function poly(a, close) {
    var s = "M" + f1(a[0]) + " " + f1(a[1]);
    for (var i = 2; i < a.length; i += 2) s += "L" + f1(a[i]) + " " + f1(a[i + 1]);
    return close ? s + "Z" : s;
  }
  // centre de la moelle : on centre la bille finie sur le disque (0, 0)
  var outer = ringPts(N - 1, M, 0), cx = 0, cy = 0;
  for (i = 0; i < outer.length; i += 2) { cx += outer[i]; cy += outer[i + 1]; }
  var PX = -cx / M, PY = -cy / M;

  // front de croissance échantillonné (160 angles fixes) : mémoire par cerne
  var FA = []; for (i = 0; i < M; i++) FA.push(TAU * i / M);
  var fillMemo = [];
  function fillR(k) {
    if (k < 0) return null;
    if (!fillMemo[k]) { var a = new Float32Array(M); for (var i = 0; i < M; i++) a[i] = ringR(k, FA[i]); fillMemo[k] = a; }
    return fillMemo[k];
  }
  // T continu (0…N) → rayon du front à l'échantillon i
  function frontD(T, scale) {
    if (T <= 0) return "M0 0Z";
    var kk = Math.min(N - 1, Math.floor(T)), q = T >= N ? 1 : out3(T - kk);
    var b = fillR(kk), a = fillR(kk - 1), s = "";
    for (var i = 0; i < M; i++) {
      var r = (a ? lerp(a[i], b[i], q) : b[i] * q) * scale;
      s += (i ? "L" : "M") + f1(r * Math.cos(FA[i])) + " " + f1(r * Math.sin(FA[i]));
    }
    return s + "Z";
  }

  /* ---------- la roue dentée du logo (tracé réel, recentré ; unités du viewBox) ---------- */
  var LOGO_PTS = [-146,-1033,-164,-1031,-172,-1029,-177,-1028,-182,-1026,-186,-1023,-189,-1019,-192,-1015,-195,-1007,-196,-994,-197,-981,-198,-969,-199,-952,-200,-936,-201,-919,-202,-904,-203,-899,-205,-894,-206,-892,-209,-891,-219,-886,-230,-882,-246,-877,-261,-871,-277,-866,-291,-861,-306,-855,-323,-849,-340,-842,-354,-835,-368,-829,-382,-822,-387,-821,-392,-820,-394,-820,-397,-822,-404,-830,-415,-843,-427,-858,-438,-872,-450,-886,-460,-897,-467,-904,-476,-911,-483,-914,-490,-915,-498,-914,-505,-911,-517,-905,-527,-899,-537,-893,-547,-886,-562,-875,-576,-864,-591,-853,-606,-842,-620,-832,-635,-821,-648,-811,-662,-801,-675,-790,-689,-780,-702,-770,-715,-760,-729,-748,-742,-736,-756,-723,-766,-712,-773,-704,-776,-700,-778,-695,-778,-690,-778,-685,-776,-677,-773,-670,-769,-663,-762,-653,-754,-643,-743,-630,-732,-618,-721,-606,-718,-601,-718,-599,-717,-596,-718,-594,-722,-587,-732,-575,-741,-563,-750,-550,-760,-538,-768,-526,-776,-514,-784,-501,-792,-488,-800,-475,-808,-461,-816,-448,-824,-434,-830,-423,-836,-411,-843,-396,-850,-381,-852,-379,-868,-379,-885,-378,-901,-378,-918,-378,-935,-377,-950,-377,-960,-376,-968,-374,-973,-371,-978,-366,-981,-362,-985,-352,-990,-337,-994,-320,-997,-308,-999,-297,-1003,-278,-1006,-260,-1010,-241,-1014,-222,-1017,-203,-1021,-185,-1025,-166,-1028,-147,-1031,-127,-1035,-108,-1038,-88,-1039,-80,-1038,-75,-1036,-71,-1034,-66,-1031,-62,-1027,-59,-1020,-55,-1012,-53,-999,-51,-983,-48,-967,-46,-951,-43,-935,-41,-925,-38,-924,-36,-922,-31,-921,-21,-921,-1,-920,19,-919,39,-918,58,-917,77,-916,92,-915,106,-913,120,-911,134,-909,148,-907,162,-904,174,-902,185,-896,202,-893,210,-890,216,-887,221,-883,224,-877,228,-872,230,-864,232,-849,234,-831,235,-813,235,-797,236,-781,236,-764,236,-748,236,-732,237,-722,236,-717,235,-715,234,-713,232,-713,229,-714,227,-720,210,-723,200,-725,190,-728,178,-730,167,-732,153,-735,139,-736,127,-738,115,-740,97,-740,84,-741,72,-742,56,-742,40,-742,24,-743,7,-742,-13,-742,-32,-741,-48,-741,-63,-740,-76,-739,-89,-738,-99,-737,-110,-734,-124,-732,-138,-730,-149,-728,-161,-725,-173,-722,-186,-719,-197,-716,-208,-712,-219,-709,-231,-705,-242,-701,-253,-697,-262,-693,-272,-688,-282,-684,-293,-679,-302,-674,-312,-669,-322,-663,-332,-657,-342,-652,-352,-645,-362,-639,-372,-633,-382,-626,-391,-619,-401,-612,-410,-604,-420,-596,-431,-588,-440,-580,-450,-571,-460,-562,-470,-553,-480,-543,-491,-535,-499,-527,-507,-516,-517,-506,-526,-496,-535,-481,-548,-466,-560,-451,-572,-435,-583,-423,-591,-412,-598,-400,-606,-390,-612,-380,-618,-369,-625,-358,-631,-342,-639,-326,-648,-310,-656,-292,-665,-275,-673,-256,-680,-238,-687,-225,-692,-212,-696,-199,-701,-188,-704,-177,-707,-167,-710,-157,-713,-143,-716,-130,-719,-117,-722,-103,-724,-89,-727,-76,-729,-62,-731,-48,-732,-35,-734,-15,-735,4,-736,24,-737,43,-737,61,-736,72,-735,82,-734,92,-733,103,-732,118,-730,133,-727,149,-724,164,-722,179,-719,189,-716,199,-714,209,-711,219,-708,229,-705,239,-701,250,-697,261,-694,270,-690,280,-686,291,-681,302,-677,311,-672,320,-668,329,-663,339,-658,349,-653,359,-647,369,-641,379,-635,389,-629,399,-623,409,-616,418,-610,428,-603,437,-596,446,-589,456,-582,464,-576,472,-569,481,-561,489,-554,498,-546,506,-538,515,-530,523,-521,530,-514,537,-506,545,-498,553,-489,560,-480,568,-471,574,-463,581,-455,588,-446,595,-436,601,-427,608,-417,614,-407,621,-397,627,-388,633,-378,638,-367,644,-357,650,-347,655,-337,660,-326,665,-316,671,-304,676,-292,681,-282,685,-271,690,-260,694,-249,698,-238,702,-227,705,-216,709,-205,712,-194,716,-183,718,-171,721,-160,724,-149,727,-137,729,-126,731,-114,733,-103,735,-91,736,-80,738,-68,739,-57,740,-45,741,-33,742,-22,742,-11,742,-1,742,11,742,22,742,34,742,46,741,57,740,69,739,80,738,92,736,102,735,113,733,123,731,133,729,144,727,156,724,167,721,179,718,191,714,204,711,215,708,226,702,243,696,257,691,270,685,284,679,297,673,310,666,324,659,337,652,349,646,362,638,375,631,387,624,398,617,409,610,420,603,430,594,442,586,453,578,463,570,474,561,483,553,493,544,503,535,512,526,521,517,530,507,539,497,548,487,556,477,564,467,572,457,580,446,587,436,595,425,602,414,609,403,616,392,622,380,629,369,635,357,641,346,646,333,652,320,658,307,664,294,669,280,674,267,679,253,683,240,688,224,693,207,697,194,701,180,704,167,707,155,710,141,712,126,715,113,717,99,719,86,721,67,723,54,723,42,724,28,724,14,724,0,725,-18,724,-36,724,-49,724,-62,723,-79,722,-96,721,-101,721,-106,722,-108,724,-110,726,-112,731,-116,745,-121,760,-126,775,-132,793,-138,812,-143,826,-149,841,-154,856,-161,872,-167,884,-168,889,-168,892,-166,894,-164,895,-157,897,-147,899,-136,900,-122,901,-108,902,-94,903,-79,903,-61,903,-43,904,-24,904,-4,904,15,904,35,904,51,903,68,903,81,902,97,900,112,898,127,895,143,893,161,890,180,886,199,883,215,879,231,875,247,871,252,871,257,871,259,872,262,873,266,879,274,893,282,908,290,922,298,936,307,951,317,964,323,972,332,978,339,981,346,982,351,982,356,980,368,975,380,970,395,963,410,956,424,948,438,941,452,934,466,927,480,920,492,913,504,907,516,900,531,891,546,882,561,874,576,864,584,857,592,851,600,844,605,838,606,836,608,831,608,826,608,821,605,808,600,793,593,777,586,760,579,743,572,726,572,724,575,719,582,712,593,704,604,695,615,687,627,677,639,667,650,658,660,648,670,640,679,631,688,623,696,614,704,606,712,597,721,587,731,576,742,563,753,550,764,536,771,529,776,526,778,525,780,525,786,526,795,529,805,532,821,538,836,543,851,549,866,553,874,554,885,553,892,551,896,549,900,545,905,539,911,528,917,516,924,503,931,490,937,477,946,460,954,443,962,426,968,411,975,397,981,383,988,369,995,351,1003,334,1010,316,1016,300,1020,287,1022,280,1023,272,1021,264,1019,260,1014,254,1008,249,1000,243,989,236,975,228,961,221,948,213,934,206,930,203,928,201,928,198,928,193,929,185,932,171,935,157,938,142,940,130,942,117,944,102,946,88,948,73,949,62,951,50,951,37,952,24,953,8,954,-9,954,-26,955,-42,956,-59,957,-61,962,-63,975,-68,988,-73,999,-78,1010,-83,1023,-90,1032,-96,1038,-100,1043,-107,1045,-114,1046,-122,1046,-130,1045,-140,1042,-151,1040,-163,1036,-179,1032,-195,1028,-211,1023,-227,1019,-243,1014,-259,1009,-275,1003,-292,998,-308,993,-324,990,-334,988,-344,983,-354,979,-363,974,-372,969,-381,964,-387,958,-392,954,-395,946,-397,939,-397,926,-398,906,-397,886,-396,866,-395,858,-395,856,-396,854,-398,849,-404,840,-417,830,-434,819,-451,809,-467,801,-480,793,-492,785,-504,775,-519,764,-534,755,-547,745,-561,735,-574,725,-589,724,-591,725,-594,729,-601,736,-611,746,-623,755,-636,765,-648,772,-659,777,-668,779,-673,780,-678,780,-685,778,-693,775,-700,770,-706,765,-712,757,-719,749,-726,734,-738,719,-751,703,-763,688,-776,673,-788,657,-800,642,-813,627,-825,617,-834,607,-842,597,-851,586,-861,576,-870,567,-877,558,-885,549,-890,543,-894,540,-895,538,-895,535,-894,530,-893,521,-887,511,-880,498,-870,485,-860,473,-849,460,-839,449,-831,437,-822,426,-815,424,-814,421,-814,407,-819,390,-826,373,-833,362,-837,351,-841,339,-846,327,-850,316,-854,305,-857,293,-861,282,-864,264,-869,246,-873,228,-878,210,-883,200,-885,189,-888,174,-890,170,-893,168,-895,166,-899,164,-912,163,-930,161,-948,160,-966,159,-985,158,-999,157,-1013,155,-1018,152,-1022,148,-1025,143,-1027,138,-1029,131,-1031,115,-1032,105,-1033,95,-1034,80,-1034,66,-1035,49,-1035,32,-1035,14,-1035,-5,-1035,-25,-1035,-44,-1035,-63,-1035,-81,-1035,-98,-1035,-115,-1034,-131,-1034];
  var LOGO_D = "M20849 11519 c-143-10-191-36-210-116-5-21-14-137-20-258-9-182-14-223-27-236-10-9-96-43-192-74-185-61-339-121-480-187-116-54-127-58-146-51-9 3-67 69-129 147-251 314-257 316-483 170-93-61-634-465-782-584-112-91-248-226-261-258-32-82 10-155 216-379 51-56 52-67 8-121-177-214-378-531-505-797 l-43-90-245-5 c-254-5-266-7-306-52-32-34-70-177-114-423-4-22-26-130-48-240-43-211-61-313-88-487-16-103-16-108 3-139 31-55 64-66 272-96 106-14 199-31 207-37 11-9 15-46 18-171 12-453 54-768 122-911 43-91 86-100 519-105 298-4 274-13 235 94-28 78-56 218-82 407-31 230-31 743 1 980 83 618 320 1106 784 1608 299 324 603 545 1068 778 564 282 1250 405 1808 325 85-12 158-24 161-26 4-2 38-9 76-15 165-26 458-124 649-216 742-359 1286-940 1611-1721 231-556 308-1156 218-1703-31-194-109-478-169-615-7-16-23-55-35-85-29-71-119-251-183-365-402-719-1006-1188-1837-1428-194-56-300-78-565-118-118-17-549-23-706-9-162 14-155 17-182-70-81-267-174-527-221-618-20-38-12-59 22-66 112-23 283-31 632-30 368 0 393 1 565 27 198 31 378 65 499 97 132 34 126 36 192-87 173-327 236-396 339-373 64 14 577 274 760 385 39 23 91 54 117 69 79 44 203 143 216 171 25 55 8 121-92 348-31 71-56 135-56 143 0 8 25 33 56 57 301 228 501 417 703 666 106 129 123 145 158 138 15-3 102-33 193-67 147-55 171-61 223-58 48 4 63 9 87 34 73 75 483 953 527 1131 27 108-5 144-242 268-60 32-123 67-139 78-32 23-32 25 2 182 55 249 81 477 88 764 3 107 7 197 9 201 2 4 26 15 52 25 147 54 270 116 305 152 58 60 46 152-74 583-11 41-47 156-79 255-33 99-59 184-59 190 0 28-69 172-100 207-49 55-80 60-287 47-151-10-176-10-196 4-13 8-62 80-110 160-120 201-245 388-360 539-53 70-97 135-97 145 0 10 34 61 76 113 235 293 233 308-66 548-276 222-475 385-526 431-180 164-254 221-286 221-33 0-79-30-202-129-215-173-280-221-301-221-11 0-74 23-140 51-164 70-388 146-520 177-22 6-107 28-190 50-82 23-171 44-197 47-74 11-74 10-87 284-7 149-16 254-24 270-22 46-72 61-234 71-175 11-922 10-1074-1z";
  var LOGO_M = "0.0230771 0 0 -0.0230771 -495.7658 162.5091";
  var NL = LOGO_PTS.length / 2;
  var LX = new Float32Array(NL), LY = new Float32Array(NL), LRho = new Float32Array(NL), LAng = new Float32Array(NL);
  var angs = [];
  for (i = 0; i < NL; i++) {
    LX[i] = LOGO_PTS[2 * i] / 10; LY[i] = LOGO_PTS[2 * i + 1] / 10;
    LRho[i] = Math.hypot(LX[i], LY[i]); LAng[i] = Math.atan2(LY[i], LX[i]);
    angs.push((LAng[i] + TAU) % TAU);
  }
  // l'ouverture de la roue = le plus grand trou angulaire du tracé
  angs.sort(function (a, b) { return a - b; });
  var g0 = 0, g1 = 0, gw = -1;
  for (i = 0; i < angs.length; i++) {
    var a0 = angs[i], a1 = i + 1 < angs.length ? angs[i + 1] : angs[0] + TAU;
    if (a1 - a0 > gw) { gw = a1 - a0; g0 = a0; g1 = a1; }
  }
  var GC = (g0 + g1) / 2, GH = gw / 2, OV = 3 * PI / 180;
  var rIn = 0;
  for (i = 0; i < NL; i++) { if (LRho[i] < 80) rIn = Math.max(rIn, LRho[i]); }
  // chaque sommet du logo reçoit sa place dans l'écorce : même angle « déplié » sur 360°, face intérieure ou extérieure
  var BA = new Float32Array(NL), BT = new Float32Array(NL), BU = new Float32Array(NL);
  for (i = 0; i < NL; i++) {
    var w = ((LAng[i] - GC) % TAU + TAU) % TAU;
    var u = (w - GH) / (TAU - 2 * GH);
    BA[i] = GC - OV / 2 + u * (TAU + OV); BU[i] = clamp(u, 0, 1);
    BT[i] = clamp((LRho[i] - (rIn + .3)) / (90 - (rIn + .3)), 0, 1);
  }
  // écorce : épaisseur rugueuse, avec fissures entre les plaques
  var FIS = []; for (i = 0; i < 38; i++) FIS.push([rnd() * TAU, .03 + .025 * rnd(), 2 + 1.6 * rnd()]);
  var BPH = [rnd() * TAU, rnd() * TAU, rnd() * TAU];
  function thick(th) {
    var t = 4.6 + .45 * Math.sin(3 * th + BPH[0]) + .35 * Math.sin(8 * th + BPH[1]) + .3 * Math.sin(23 * th + BPH[2]);
    for (var j = 0; j < FIS.length; j++) {
      var d = th - FIS[j][0]; d = ((d + PI) % TAU + TAU) % TAU - PI;
      if (d > -FIS[j][1] && d < FIS[j][1]) t -= FIS[j][2] * (1 - Math.abs(d) / FIS[j][1]);
    }
    return Math.max(1.3, t);
  }
  var BTH = new Float32Array(NL), BC = new Float32Array(NL), BS = new Float32Array(NL);
  for (i = 0; i < NL; i++) { BTH[i] = thick(BA[i]); BC[i] = Math.cos(BA[i]); BS[i] = Math.sin(BA[i]); }
  var barkMemo = [];
  function barkR(k) {
    if (k < 0) return null;
    if (!barkMemo[k]) { var a = new Float32Array(NL); for (var i = 0; i < NL; i++) a[i] = ringR(k, BA[i]); barkMemo[k] = a; }
    return barkMemo[k];
  }
  // point d'écorce i quand le front est à T (repère du disque)
  var BXs = new Float32Array(NL), BYs = new Float32Array(NL);
  function barkPts(T) {
    var kk = Math.min(N - 1, Math.floor(T)), q = T >= N ? 1 : out3(T - kk);
    var b = barkR(kk), a = barkR(kk - 1), fr0 = a ? 0 : 1;
    var gf = .3 + .7 * clamp((a ? lerp(R[kk - 1], R[kk], q) : R[kk] * q) / R[N - 1], 0, 1);
    for (var i = 0; i < NL; i++) {
      var fr = a ? lerp(a[i], b[i], q) : b[i] * q;
      var r = Math.max(0, fr + .45) + BT[i] * (BTH[i] * gf * (fr0 ? q : 1) - .45);
      BXs[i] = PX + r * BC[i]; BYs[i] = PY + r * BS[i];
    }
  }
  function ptsD(X, Y) {
    var s = "M" + f1(X[0]) + " " + f1(Y[0]);
    for (var i = 1; i < NL; i++) s += "L" + f1(X[i]) + " " + f1(Y[i]);
    return s + "Z";
  }
  // morphose écorce → roue dentée : interpolation polaire autour du centre du disque
  barkPts(N);
  var MRs = new Float32Array(NL), MAs = new Float32Array(NL), MRt = new Float32Array(NL), MAt = new Float32Array(NL);
  for (i = 0; i < NL; i++) {
    MRs[i] = Math.hypot(BXs[i], BYs[i]); MAs[i] = Math.atan2(BYs[i], BXs[i]);
    MRt[i] = LRho[i];
    var da = LAng[i] - MAs[i]; da = ((da + PI) % TAU + TAU) % TAU - PI;
    MAt[i] = MAs[i] + da;
  }
  // état intermédiaire : la même bande, mais sans dents (les flancs et sommets des dents sont rabattus sur la jante)
  var RAW = new Float32Array(360), RIM = new Float32Array(360), MRi = new Float32Array(NL);
  for (i = 0; i < NL; i++) if (BT[i] >= .99) { var bin = Math.floor(((LAng[i] + TAU) % TAU) * 180 / PI) % 360; RAW[bin] = RAW[bin] ? Math.min(RAW[bin], LRho[i]) : LRho[i]; }
  function rimAt(b, h) { var v = 1e9; for (var d = -h; d <= h; d++) { var x = RAW[(b + d + 360) % 360]; if (x) v = Math.min(v, x); } return v; }
  for (i = 0; i < 360; i++) RIM[i] = rimAt(i, 13);             // érosion : on passe sous les dents
  for (i = 0; i < 360; i++) { var sum = 0; for (var d = -8; d <= 8; d++) sum += RIM[(i + d + 360) % 360]; RAW[i] = sum / 17; }
  for (i = 0; i < NL; i++) {
    var bn = Math.floor(((LAng[i] + TAU) % TAU) * 180 / PI) % 360;
    MRi[i] = BT[i] >= .99 ? Math.min(LRho[i], RAW[bn] + .4) : LRho[i];
  }
  var MX = new Float32Array(NL), MY = new Float32Array(NL);
  // m = 0…MA : l'écorce se lisse, s'ouvre et durcit en bande de bronze (le bois se resserre en même temps) ;
  // m = MA…1 : les dents sortent une à une en faisant le tour, avec un léger dépassement de ressort
  var MA = .4, SPREAD = .72;
  function back(t) { var c = 1.4, u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; }
  function morphD(m) {
    var eA = inOut3(clamp(m / MA, 0, 1)), mB = clamp((m - MA) / (1 - MA), 0, 1);
    for (var i = 0; i < NL; i++) {
      var r = lerp(MRs[i], MRi[i], eA), a = lerp(MAs[i], MAt[i], eA);
      if (mB > 0 && MRt[i] > MRi[i]) r = lerp(MRi[i], MRt[i], back(clamp((mB - SPREAD * BU[i]) / (1 - SPREAD), 0, 1)));
      MX[i] = r * Math.cos(a); MY[i] = r * Math.sin(a);
    }
    return ptsD(MX, MY);
  }
  // le bois se resserre juste assez pour se loger dans le moyeu de la roue
  var wMinR = 1e9;
  for (i = 0; i < M; i++) { var th = FA[i], rr = ringR(N - 1, th); wMinR = Math.min(wMinR, Math.hypot(PX + rr * Math.cos(th), PY + rr * Math.sin(th))); }
  var SW = (rIn + 1.2) / wMinR;

  /* ---------- fentes de séchage, marques du guide, rayons ---------- */
  function checkShape(j) {
    var beta = (j * 90 + 28 + (hash(j + 70) - .5) * 50) * PI / 180;
    var r0 = ringR(N - 1, beta) + 1.5, len = R[N - 1] * (.34 + .26 * hash(j + 80)), n = 7;
    var ox = r0 * Math.cos(beta), oy = r0 * Math.sin(beta), nx = -Math.sin(beta), ny = Math.cos(beta);
    var left = [], right = [], wob = 0;
    for (var s = 0; s <= n; s++) {
      var t = s / n, r = r0 - len * t, half = 1.55 * Math.pow(1 - t, 1.4) + .04;
      wob += (hash(j * 13 + s) - .5) * 1.6 * (s ? 1 : 0);
      var x = r * Math.cos(beta) + nx * wob, y = r * Math.sin(beta) + ny * wob;
      left.push(x + nx * half, y + ny * half); right.unshift(x - nx * half, y - ny * half);
      if (s === n) right.unshift(x, y);
    }
    return { d: poly(left.concat(right), true), ox: ox, oy: oy };
  }
  var CHECKS = []; for (var j = 0; j < 4; j++) CHECKS.push(checkShape(j));
  // la barre pivote autour de la tête d'abattage : marques en arcs concentriques, inclinées d'environ 12°
  var PIV = 290, PA = (180 + 12) * PI / 180, PVX = PIV * Math.cos(PA), PVY = PIV * Math.sin(PA);
  var SAW = [], sawD = "";
  for (i = 0; i < 30; i++) {
    var sr = PIV - 104 + i * 7.2 + (hash(i + 200) - .5) * 2.4, span = .42;
    var a0 = PA + PI - span, a1 = PA + PI + span;
    SAW.push({ r: sr, d: "M" + f1(PVX + sr * Math.cos(a0)) + " " + f1(PVY + sr * Math.sin(a0)) +
      "A" + f1(sr) + " " + f1(sr) + " 0 0 1 " + f1(PVX + sr * Math.cos(a1)) + " " + f1(PVY + sr * Math.sin(a1)) });
  }
  var KR = PIV - 118;
  var kerfD = "M" + f1(PVX + KR * Math.cos(PA + PI - .5)) + " " + f1(PVY + KR * Math.sin(PA + PI - .5)) +
    "A" + KR + " " + KR + " 0 0 1 " + f1(PVX + KR * Math.cos(PA + PI + .5)) + " " + f1(PVY + KR * Math.sin(PA + PI + .5));
  var rays = "";
  for (i = 0; i < 64; i++) {
    var ra = rnd() * TAU, r1 = R[N - 1] * (.18 + .5 * rnd()), r2 = Math.min(r1 + 10 + 30 * rnd(), ringR(N - 1, ra) - 2);
    rays += "M" + f1(r1 * Math.cos(ra)) + " " + f1(r1 * Math.sin(ra)) + "L" + f1(r2 * Math.cos(ra)) + " " + f1(r2 * Math.sin(ra));
  }
  var ghost = "";
  for (k = 0; k < N; k++) ghost += poly(ringPts(k, 72, 0), true);

  /* ---------- construction du SVG ---------- */
  var pine = "";
  for (var c = icon.firstElementChild; c; c = c.nextElementSibling) pine += c.outerHTML;
  var ringsSvg = "", defsRings = "", INSET = 1.3; // le bois final (bois d'été) est juste en dedans du cambium
  for (k = 0; k < N; k++) {
    var lw = .5 + .75 * (W[k] - wMin) / (wMax - wMin);
    defsRings += '<path id="fx-rings-r' + k + '" pathLength="1" d="' + poly(ringPts(k, M, START[k], INSET), true) + '"/>';
    ringsSvg += '<g class="fx-rings-ring" visibility="hidden" stroke-dasharray="1 1" stroke-dashoffset="1">' +
      '<use href="#fx-rings-r' + k + '" stroke="#9A6A34" stroke-opacity=".22" stroke-width="' + f1(Math.max(1.4, W[k] * .5)) + '"/>' +
      '<use href="#fx-rings-r' + k + '" stroke="#6B4A1F" stroke-opacity="' + (.5 + .3 * hash(k + 9)).toFixed(2) + '" stroke-width="' + lw.toFixed(2) + '"/></g>';
  }
  var sawSvg = ""; for (i = 0; i < 30; i++) sawSvg += '<path d="' + SAW[i].d + '" opacity="0"/>';
  var checkSvg = ""; for (j = 0; j < 4; j++) checkSvg += '<path d="' + CHECKS[j].d + '" transform="scale(0)"/>';
  var label = lang === "fr" ? "CERNES" : "RINGS";

  var svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "fx-rings-svg");
  svg.setAttribute("viewBox", "-110 -110 220 220");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.innerHTML =
    '<defs>' +
      '<radialGradient id="fx-rings-sap" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="98"><stop offset="0" stop-color="#D9B98B"/><stop offset=".62" stop-color="#E2C9A2"/><stop offset="1" stop-color="#E9D6B8"/></radialGradient>' +
      '<radialGradient id="fx-rings-heart" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="' + f1(R[HK] * 1.1) + '"><stop offset="0" stop-color="#8A5A1E"/><stop offset=".55" stop-color="#96652A"/><stop offset="1" stop-color="#A26D27"/></radialGradient>' +
      '<radialGradient id="fx-rings-barkg" cx=".5" cy=".5" r=".5"><stop offset=".9" stop-color="#5A4534"/><stop offset="1" stop-color="#46372A"/></radialGradient>' +
      '<clipPath id="fx-rings-disc"><path d="' + poly(ringPts(N - 1, M, 0), true) + '"/></clipPath>' +
      defsRings +
    '</defs>' +
    '<g class="fx-rings-rot">' +
      '<g class="fx-rings-wood">' +
        '<g transform="translate(' + f1(PX) + ' ' + f1(PY) + ')">' +
          '<path class="fx-rings-ghost" d="' + ghost + '" fill="none" stroke="#D9A864" stroke-opacity=".22" stroke-width=".45"/>' +
          '<path class="fx-rings-sapf" fill="url(#fx-rings-sap)" stroke="#9A5E32" stroke-width="2.6" stroke-linejoin="round" d="M0 0Z"/>' +
          '<path class="fx-rings-heartf" fill="url(#fx-rings-heart)" stroke="#B98549" stroke-opacity=".45" stroke-width="3.2" stroke-linejoin="round" d="M0 0Z"/>' +
          '<g clip-path="url(#fx-rings-disc)">' +
            '<path class="fx-rings-rays" d="' + rays + '" fill="none" stroke="#6B4A1F" stroke-width=".35" opacity="0"/>' +
          '</g>' +
          '<g fill="none" stroke-linecap="butt">' + ringsSvg + '</g>' +
          '<g clip-path="url(#fx-rings-disc)">' +
            '<g class="fx-rings-saw" fill="none" stroke="#2A1C0E" stroke-opacity=".13" stroke-width=".7">' + sawSvg + '</g>' +
            '<g class="fx-rings-kerf" fill="none" stroke="#FBF1DD" stroke-linecap="round" opacity="0"><path d="' + kerfD + '" stroke-width="5" stroke-opacity=".14"/><path d="' + kerfD + '" stroke-width=".9"/></g>' +
            '<g class="fx-rings-checks" fill="#23170C" fill-opacity=".82">' + checkSvg + '</g>' +
          '</g>' +
          '<circle class="fx-rings-pith" r="2.6" fill="#6B4520" opacity="0"/>' +
        '</g>' +
      '</g>' +
      '<path class="fx-rings-bark" fill="url(#fx-rings-barkg)" stroke="#241A11" stroke-width=".5" stroke-linejoin="round" d="M0 0Z"/>' +
      '<g transform="translate(' + f1(PX) + ' ' + f1(PY) + ')"><g class="fx-rings-pen" opacity="0"><circle r="3.2" fill="#FBF1DD" fill-opacity=".18"/><circle r="1.15" fill="#FBF1DD"/></g></g>' +
      '<path class="fx-rings-logo" fill="#A26D27" transform="matrix(' + LOGO_M + ')" d="' + LOGO_D + '" visibility="hidden"/>' +
      '<g class="fx-rings-pine" fill="none" stroke="#D9A864" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + pine + '</g>' +
    '</g>' +
    '<g class="fx-rings-count" aria-hidden="true">' +
      '<text x="-109.5" y="-100" class="fx-rings-lab">' + label + '</text>' +
      '<text x="-109.5" y="-86" class="fx-rings-num">00</text>' +
    '</g>';

  function q(sel) { return svg.querySelector(sel); }
  var elRot = q(".fx-rings-rot"), elWood = q(".fx-rings-wood"), elSap = q(".fx-rings-sapf"), elHeart = q(".fx-rings-heartf"),
      elBark = q(".fx-rings-bark"), elLogo = q(".fx-rings-logo"), elPine = q(".fx-rings-pine"), elPith = q(".fx-rings-pith"), elPen = q(".fx-rings-pen"),
      elRays = q(".fx-rings-rays"), elKerf = q(".fx-rings-kerf"), elNum = q(".fx-rings-num");
  var elRings = svg.querySelectorAll(".fx-rings-ring"), elSaw = q(".fx-rings-saw").children, elChecks = q(".fx-rings-checks").children;

  /* ---------- rendu d'une progression p ---------- */
  var st = { p: -1, T: -1, rot: null, pine: -1, cut: -1, mo: -1, n: -1, q: [] };
  for (k = 0; k < N; k++) st.q[k] = -1;
  var BARKC = [[0x5A, 0x45, 0x34], [0x46, 0x37, 0x2A]], BSTROKE = [0x24, 0x1A, 0x11], BRONZE = [0xA2, 0x6D, 0x27];
  var elStops = svg.querySelectorAll("#fx-rings-barkg stop");
  function mix(a, b, t) { return "rgb(" + Math.round(lerp(a[0], b[0], t)) + "," + Math.round(lerp(a[1], b[1], t)) + "," + Math.round(lerp(a[2], b[2], t)) + ")"; }

  function render(p) {
    if (p === st.p) return;
    st.p = p;
    var T = clamp((p - P0) / (PG - P0), 0, 1) * N;
    var cut = clamp((p - PG) / (PC - PG), 0, 1);
    var mo = clamp((p - PC) / (1 - PC), 0, 1);

    // rotation du disque : −8° → 0
    var rot = "rotate(" + (-8 * (1 - p)).toFixed(2) + ")";
    if (rot !== st.rot) { elRot.setAttribute("transform", rot); st.rot = rot; }

    // le pin descend dans la moelle
    var ps = clamp(p / P0, 0, 1);
    if (ps !== st.pine) {
      st.pine = ps;
      if (ps >= 1) elPine.setAttribute("visibility", "hidden");
      else {
        var pe = inOut3(ps), sc = 2.2 * (1 - .9 * pe);
        elPine.removeAttribute("visibility");
        elPine.setAttribute("transform", "translate(" + f1(PX * pe) + " " + f1(PY * pe) + ") scale(" + sc.toFixed(3) + ") translate(-12 -12.5)");
        elPine.setAttribute("opacity", (1 - pe * pe).toFixed(3));
      }
      elPith.setAttribute("opacity", clamp(ps * 1.6 - .5, 0, 1).toFixed(2));
    }

    // cernes : seuls ceux dont la progression change sont touchés
    for (k = 0; k < N; k++) {
      var qk = clamp(T - k, 0, 1);
      if (qk === st.q[k]) continue;
      var g = elRings[k], was = st.q[k];
      st.q[k] = qk;
      if (qk <= 0) { g.setAttribute("visibility", "hidden"); continue; }
      if (was <= 0) g.removeAttribute("visibility");
      if (qk >= 1) { g.setAttribute("stroke-dasharray", "none"); g.removeAttribute("transform"); g.setAttribute("stroke-dashoffset", "0"); continue; }
      if (was >= 1 || was < 0) g.setAttribute("stroke-dasharray", "1 1");
      g.setAttribute("stroke-dashoffset", (1 - qk).toFixed(4));
      g.setAttribute("transform", "scale(" + lerp(k ? R[k - 1] / R[k] : 0, 1, out3(qk)).toFixed(4) + ")");
    }

    // la « plume » du cambium, au bout du cerne en train de se tracer
    var kp = Math.floor(T), qp = T - kp, pen = kp < N && qp > 0 ? Math.sin(PI * clamp(qp * 1.25, 0, 1)) : 0;
    if (pen > .002) {
      var thp = START[kp] + TAU * qp, sp = lerp(kp ? R[kp - 1] / R[kp] : 0, 1, out3(qp)), rp = sp * (ringR(kp, thp) - INSET);
      elPen.setAttribute("transform", "translate(" + f1(rp * Math.cos(thp)) + " " + f1(rp * Math.sin(thp)) + ")");
      elPen.setAttribute("opacity", pen.toFixed(3)); st.pen = 1;
    } else if (st.pen) { elPen.setAttribute("opacity", "0"); st.pen = 0; }

    // front de croissance : aubier, bois de cœur, écorce
    if (T !== st.T) {
      st.T = T;
      elSap.setAttribute("d", frontD(T, 1));
      var Th = clamp((T - 6) * HK / (N - 6), 0, HK);
      elHeart.setAttribute("d", Th > 0 ? frontD(Th, 1) : "M0 0Z");
      if (mo <= 0) {
        if (T > 0) { barkPts(T); elBark.setAttribute("d", ptsD(BXs, BYs)); } else elBark.setAttribute("d", "M0 0Z");
      }
      var n = Math.min(N, Math.floor(T + 1e-6));
      if (n !== st.n) { st.n = n; elNum.textContent = (n < 10 ? "0" : "") + n; }
    }

    // tronçonnage : passe du guide, marques de scie, fentes, rayons
    if (cut !== st.cut) {
      st.cut = cut;
      var sweep = lerp(PIV - 118, PIV + 118, inOut3(clamp(cut / .8, 0, 1)));
      for (i = 0; i < 30; i++) elSaw[i].setAttribute("opacity", clamp((sweep - SAW[i].r) / 10, 0, 1).toFixed(2));
      var ke = Math.sin(PI * clamp(cut / .8, 0, 1));
      elKerf.setAttribute("opacity", (ke * .75).toFixed(3));
      elKerf.setAttribute("transform", "translate(" + f1(PVX) + " " + f1(PVY) + ") scale(" + (sweep / KR).toFixed(4) + ") translate(" + f1(-PVX) + " " + f1(-PVY) + ")");
      for (j = 0; j < 4; j++) {
        var cq = out3(clamp((cut - .25 - j * .12) / .45, 0, 1)), C = CHECKS[j];
        elChecks[j].setAttribute("transform", "translate(" + f1(C.ox) + " " + f1(C.oy) + ") scale(" + cq.toFixed(3) + ") translate(" + f1(-C.ox) + " " + f1(-C.oy) + ")");
      }
      elRays.setAttribute("opacity", (.07 * clamp(cut * 1.6, 0, 1)).toFixed(3));
    }

    // l'écorce devient la roue dentée
    if (mo !== st.mo) {
      var wasMo = st.mo; st.mo = mo;
      if (mo >= 1) {
        elBark.setAttribute("visibility", "hidden"); elLogo.removeAttribute("visibility");
      } else {
        if (wasMo >= 1) { elBark.removeAttribute("visibility"); elLogo.setAttribute("visibility", "hidden"); }
        if (mo > 0) elBark.setAttribute("d", morphD(mo));
        else if (wasMo > 0) { barkPts(T); elBark.setAttribute("d", ptsD(BXs, BYs)); }
        var ce = inOut3(clamp(mo / MA, 0, 1));
        for (j = 0; j < 2; j++) elStops[j].setAttribute("stop-color", mix(BARKC[j], BRONZE, ce));
        elBark.setAttribute("stroke", mix(BSTROKE, BRONZE, ce));
      }
      var s = lerp(1, SW, inOut3(clamp(mo / MA, 0, 1)));
      if (s === 1) elWood.removeAttribute("transform"); else elWood.setAttribute("transform", "scale(" + s.toFixed(4) + ")");
    }
  }

  /* ---------- montage ---------- */
  icon.parentNode.replaceChild(svg, icon);
  card.classList.add("fx-rings-on");

  var wide = window.matchMedia("(min-width: 961px)");
  function target() {
    var vh = window.innerHeight || L.scroll.vh;
    if (wide.matches) {
      var r = story.getBoundingClientRect();
      return clamp((vh * .62 - r.top) / Math.max(1, r.height), 0, 1);
    }
    var c = card.getBoundingClientRect();
    return clamp((vh - c.top) / (vh * .85), 0, 1);
  }

  if (L.reduce) { render(1); return; }

  var cur = -1;
  var task = {
    update: function (dt) {
      if (L.reduce) { cur = 1; render(1); return false; }
      var t = target();
      if (cur < 0) cur = t;
      else cur = L.damp(cur, t, 9, dt);
      if (Math.abs(cur - t) < 2e-4) cur = t;
      render(cur);
      return cur !== t;
    }
  };
  render(target());
  cur = st.p;
  L.onVisible(card, function (on) { if (on) L.fx.add(task); else L.fx.remove(task); }, "80px");
})();
