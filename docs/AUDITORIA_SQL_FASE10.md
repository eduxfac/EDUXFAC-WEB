# Auditoría SQL FASE 10

366 sitios query/exec del backend; SEGURO es SQL fijo/parametrizado, catálogo o administración explícita. DEPENDE DE RLS incluye hijos/agregados sin filtro empresa directo. Ningún RIESGO/BLOQUEANTE abierto de aislamiento observado bajo el perfil global. No concatenación ejecutable de valores de usuario detectada.

| Archivo | Línea | Clase | Contexto | Dinámica |
|---|---|---|---|---|
| server/src/admin-service-api.js | 16 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/admin-service-api.js | 35 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/admin-service-api.js | 38 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/admin-service-api.js | 39 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/admin-service-api.js | 41 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/admin-service-api.js | 49 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/admin-service-api.js | 55 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/admin-service-api.js | 57 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/admin-service-api.js | 65 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/app.js | 54 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 69 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 81 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 90 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 100 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 106 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 115 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 156 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 166 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 181 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 183 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 187 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 189 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 199 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 200 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 202 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 213 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 242 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 244 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 262 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 267 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 268 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 269 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 272 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 274 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 285 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 305 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 308 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 311 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 328 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 335 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 338 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 339 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 340 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 364 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 377 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 380 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 382 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 384 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 387 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 399 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 400 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 403 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 405 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 406 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 407 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 417 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 419 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 426 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 428 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 430 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 435 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 440 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 442 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 446 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 457 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 458 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 468 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 473 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 487 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 491 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 494 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 497 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 499 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 500 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 511 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 512 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 513 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 519 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 524 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 530 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 533 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 549 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 552 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 560 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 563 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 564 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 589 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 592 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 596 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 597 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 599 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 609 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 617 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 629 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 632 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 644 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 645 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 646 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 647 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 648 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 649 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 650 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 651 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 662 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 669 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 670 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 677 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 678 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 692 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 693 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 712 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 750 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 751 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 753 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 763 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 775 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 778 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 780 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 781 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 795 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 796 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 800 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 803 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 804 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 805 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 818 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 821 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 824 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 835 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 844 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 857 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 865 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 868 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 869 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 882 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 892 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 902 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 903 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 904 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 913 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 939 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 950 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 955 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 961 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 965 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 979 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 980 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 992 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1001 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1003 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1009 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1013 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1015 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1020 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1021 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1022 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1023 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1041 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1073 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1079 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1087 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1094 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1102 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1103 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1104 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1111 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1112 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1122 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1129 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1137 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1141 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1151 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1157 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1158 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1169 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1181 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1193 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1196 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1198 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1200 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1220 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1221 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1222 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1223 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1224 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1225 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1230 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1231 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1235 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1250 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1252 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1260 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1263 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1272 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1273 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1274 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1288 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1295 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1300 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 1306 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 1307 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 1308 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1438 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 1456 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 1457 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 1461 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1463 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1503 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 1513 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1514 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1517 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 1520 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 1525 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1526 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1563 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 1570 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 1581 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1586 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1588 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1590 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1614 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1615 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1693 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1706 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1746 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 1751 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 1758 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1800 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 1801 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 1802 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 1821 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 1822 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 1832 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 1833 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 1843 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 1844 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 1859 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 1860 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 1867 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 1868 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 1875 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 1876 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 1882 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1889 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 1896 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 1897 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 1898 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/app.js | 1911 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1912 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1913 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1917 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1918 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1925 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1928 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1929 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1939 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1950 | SEGURO | catálogo/guarda sin datos cliente | no |
| server/src/app.js | 1954 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1957 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1962 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1963 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1964 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1965 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/app.js | 1966 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/auth.js | 25 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/branch-admin.js | 7 | SEGURO | catálogo/guarda sin datos cliente | no |
| server/src/branch-admin.js | 17 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/branch-admin.js | 20 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/branch-admin.js | 29 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/branch-admin.js | 30 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/branch-admin.js | 41 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/branch-admin.js | 54 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/branch-admin.js | 64 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/branch-admin.js | 68 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/branch-admin.js | 77 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/branch-catalog.js | 4 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/branch-catalog.js | 16 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/branch-catalog.js | 33 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/commercial-api.js | 11 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/commercial-api.js | 24 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/commercial-api.js | 25 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/commercial-api.js | 27 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/commercial-api.js | 34 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/commercial-api.js | 37 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/commercial-api.js | 38 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/commercial-api.js | 42 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/commercial-conditions.js | 4 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/commercial-conditions.js | 9 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/commercial-conditions.js | 27 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/company-access.js | 6 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/db.js | 26 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/db.js | 28 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/db.js | 29 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/db.js | 34 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/db.js | 37 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/db.js | 40 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/db.js | 42 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/db.js | 43 | SEGURO | catálogo/guarda sin datos cliente | no |
| server/src/db.js | 45 | SEGURO | catálogo/guarda sin datos cliente | no |
| server/src/db.js | 48 | SEGURO | catálogo/guarda sin datos cliente | no |
| server/src/db.js | 50 | SEGURO | catálogo/guarda sin datos cliente | no |
| server/src/inventory-count.js | 12 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | sí |
| server/src/inventory-count.js | 20 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/inventory-count.js | 33 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/inventory-count.js | 60 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/inventory-entry.js | 10 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/inventory-entry.js | 16 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/inventory-entry.js | 21 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/inventory-entry.js | 23 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/inventory-entry.js | 33 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/inventory-entry.js | 34 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/inventory-entry.js | 35 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/inventory-entry.js | 37 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/onboarding-api.js | 22 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/onboarding-api.js | 23 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/onboarding-api.js | 26 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/onboarding-api.js | 30 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/onboarding-api.js | 36 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/onboarding-api.js | 48 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/onboarding-api.js | 49 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/onboarding-api.js | 52 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/onboarding-api.js | 61 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/onboarding-api.js | 62 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/onboarding-api.js | 63 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/onboarding-api.js | 70 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/onboarding-api.js | 72 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/onboarding-api.js | 83 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/onboarding-api.js | 84 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/onboarding-api.js | 85 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/onboarding-api.js | 87 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/onboarding-api.js | 97 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/onboarding-api.js | 100 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/onboarding-api.js | 103 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/operations-api.js | 14 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/operations-api.js | 15 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/operations-api.js | 17 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/operations-api.js | 18 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/password-change.js | 10 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/password-change.js | 13 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/password-change.js | 14 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/report-document.js | 9 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/report-document.js | 11 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/report-document.js | 20 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/report-document.js | 26 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/report-document.js | 30 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/report-document.js | 35 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/report-document.js | 40 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/report-document.js | 41 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/report-document.js | 43 | DEPENDE DE RLS | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/subscription-api.js | 11 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/subscription-api.js | 23 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/subscription-api.js | 24 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/subscription-api.js | 26 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/subscription-api.js | 40 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/subscription-api.js | 43 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/subscription-service.js | 6 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/subscription-service.js | 10 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/subscription-service.js | 21 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/subscription-service.js | 26 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/subscription-service.js | 32 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/subscription-service.js | 38 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/subscription-service.js | 42 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/subscription-service.js | 43 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/subscription-service.js | 46 | SEGURO | service explícito o guarda empresa; valores parametrizados | no |
| server/src/tenant-guard.js | 4 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |
| server/src/tenant-guard.js | 10 | SEGURO | tenant JWT SET LOCAL, ramas DB + ACL/FORCE | no |

Revisión dinámica: app.js where/base cláusulas internas y valores $n; cfg.table/name/doc lista fija cliente/proveedor; tablas de uso/producto y categorías/laboratorios listas fijas; metric/order/suffix/costExpr seleccionan literales permitidos. branch-admin.js identifica FK en catálogo y escapa comillas de nombres, valores $1. inventory-count.js stockQuery interna parametrizada. Hijos (detalles, pagos, lotes, cajas) y agregados usan RLS heredada; vistas security_invoker. pool.connect establece contexto tras BEGIN; tx controla commit/rollback; initializeDatabase producción no migra. scripts/migrate.js requiere URL migrador bajo autorización futura; scripts/global-rls.js solo laboratorio, nombres de roles validados, tabla desconocida falla cerrado.

Backend/credenciales DB comprometidos pueden cambiar GUC: RLS no firma criptográficamente el tenant y la garantía es frente a usuarios finales. Credenciales DB nunca al navegador; pruebas de SQL injection, SET ROLE, row_security=off, propiedad y roles privilegiados. Exportadores genéricos formatean filas del navegador sin leer DB, no certifican autenticidad; exportaciones oficiales leen backend protegido.

