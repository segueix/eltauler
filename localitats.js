/* Localitats per a la lliga (LLIGA.md §6).
 *
 * La lliga comença al municipi del jugador i puja per la comarca, la
 * província, el territori, els Països Catalans, Europa i el món. Aquí hi ha
 * les dades per preguntar on juga i per donar origen als rivals:
 *
 * - Els 947 municipis de Catalunya amb la comarca i la província (Idescat,
 *   «Codis territorials: municipis», https://www.idescat.cat/codis/?id=50&n=9,
 *   baixat el novembre de 2026). Els articles van al davant («el Masnou»).
 * - Les comarques (o illes) dels altres territoris dels Països Catalans amb la
 *   província, i els seus municipis: els 542 del País Valencià (Viquipèdia,
 *   «Llista dels municipis del País Valencià»), els 198 de parla catalana de
 *   la Catalunya Nord (Viquipèdia, «Llista de comunes de la Catalunya del
 *   Nord»; la Fenolleda, occitana, no en té cap), els de parla catalana de les
 *   comarques de la Franja (Viquipèdia, articles de cada comarca) i els 67 de
 *   les Illes Balears, baixats el novembre de 2026; a Andorra, les parròquies
 *   i els pobles; a l'Alguer, els llocs de la Nurra, de la província de Sàsser
 *   i les ciutats de Sardenya. Fora de Catalunya el municipi també es pot
 *   escriure a mà.
 * - On cap nivell no pot repetir l'àrea del de sota (LLIGA.md §6): les illes
 *   de les Balears s'agrupen en Gimnèsies i Pitiüses.
 * - Ciutats dels Països Catalans i països d'Europa i del món per als rivals
 *   dels nivells de dalt.
 *
 * Tot és pur (sense DOM): app.js en fa la finestra i core.js els noms.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.ElTaulerLocalitats = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function () {
    'use strict';

    // Territoris (el nom de la lliga del quart nivell és a core.js:
    // LEAGUE_TERRITORY_NAMES).
    const TERRITORIES = [
        { id: 'cat', name: 'Catalunya' },
        { id: 'val', name: 'País Valencià' },
        { id: 'bal', name: 'Illes Balears' },
        { id: 'and', name: 'Andorra' },
        { id: 'nord', name: 'Catalunya Nord' },
        { id: 'franja', name: 'Franja de Ponent' },
        { id: 'alguer', name: "l'Alguer" },
        { id: 'fora', name: 'Fora dels Països Catalans' }
    ];

    const CAT_PROVINCES = { '08': 'Barcelona', '17': 'Girona', '25': 'Lleida', '43': 'Tarragona' };
    // Codis de comarca d'Idescat, amb l'article.
    const CAT_COMARQUES = {
        '01': "l'Alt Camp", '02': "l'Alt Empordà", '03': "l'Alt Penedès", '04': "l'Alt Urgell",
        '05': "l'Alta Ribagorça", '06': "l'Anoia", '07': 'el Bages', '08': 'el Baix Camp',
        '09': 'el Baix Ebre', '10': 'el Baix Empordà', '11': 'el Baix Llobregat', '12': 'el Baix Penedès',
        '13': 'el Barcelonès', '14': 'el Berguedà', '15': 'la Cerdanya', '16': 'la Conca de Barberà',
        '17': 'el Garraf', '18': 'les Garrigues', '19': 'la Garrotxa', '20': 'el Gironès',
        '21': 'el Maresme', '22': 'el Montsià', '23': 'la Noguera', '24': 'Osona',
        '25': 'el Pallars Jussà', '26': 'el Pallars Sobirà', '27': "el Pla d'Urgell", '28': "el Pla de l'Estany",
        '29': 'el Priorat', '30': "la Ribera d'Ebre", '31': 'el Ripollès', '32': 'la Segarra',
        '33': 'el Segrià', '34': 'la Selva', '35': 'el Solsonès', '36': 'el Tarragonès',
        '37': 'la Terra Alta', '38': "l'Urgell", '39': "la Val d'Aran", '40': 'el Vallès Occidental',
        '41': 'el Vallès Oriental', '42': 'el Moianès', '43': 'el Lluçanès'
    };
    // nom|comarca|província (codis d'Idescat i de l'INE).
    const CAT_MUNICIPIS = 'Abella de la Conca|25|25\nAbrera|11|08\nAgramunt|38|25\nAguilar de Segarra|07|08\nAgullana|02|17\nAiguafreda|24|08\nAiguamúrcia|01|43\nAiguaviva|20|17\nAitona|33|25\nAlbanyà|02|17\nAlbatàrrec|33|25\nAlbesa|23|25\nAlbinyana|12|43\nAlbons|10|17\nAlcanar|22|43\nAlcanó|33|25\nAlcarràs|33|25\nAlcoletge|33|25\nAlcover|01|43\nAldover|09|43\nAlella|21|08\nAlfara de Carles|09|43\nAlfarràs|33|25\nAlforja|08|43\nAlfés|33|25\nAlgerri|23|25\nAlguaire|33|25\nAlins|26|25\nAlió|01|43\nAlmacelles|33|25\nAlmatret|33|25\nAlmenar|33|25\nAlmoster|08|43\nAlp|15|17\nAlpens|43|08\nAlpicat|33|25\nAlt Àneu|26|25\nAltafulla|36|43\nAlàs i Cerc|04|25\nAlòs de Balaguer|23|25\nAmer|34|17\nAmposta|22|43\nAnglesola|38|25\nAnglès|34|17\nArbeca|18|25\nArbolí|08|43\nArbúcies|34|17\nArenys de Mar|21|08\nArenys de Munt|21|08\nArgelaguer|19|17\nArgentona|21|08\nArgençola|06|08\nArnes|37|43\nArres|39|25\nArsèguel|04|25\nArtesa de Lleida|33|25\nArtesa de Segre|23|25\nArtés|07|08\nAscó|30|43\nAspa|33|25\nAvinyonet de Puigventós|02|17\nAvinyonet del Penedès|03|08\nAvinyó|07|08\nAvià|14|08\nBadalona|13|08\nBadia del Vallès|40|08\nBagà|14|08\nBaix Pallars|26|25\nBalaguer|23|25\nBalenyà|24|08\nBalsareny|07|08\nBanyeres del Penedès|12|43\nBanyoles|28|17\nBarbens|27|25\nBarberà de la Conca|16|43\nBarberà del Vallès|40|08\nBarcelona|13|08\nBassella|04|25\nBatea|37|43\nBausen|39|25\nBegues|11|08\nBegur|10|17\nBelianes|38|25\nBell-lloc d\'Urgell|27|25\nBellaguarda|18|25\nBellcaire d\'Empordà|10|17\nBellcaire d\'Urgell|23|25\nBellmunt d\'Urgell|23|25\nBellmunt del Priorat|29|43\nBellprat|06|08\nBellpuig|38|25\nBellvei|12|43\nBellver de Cerdanya|15|25\nBellvís|27|25\nBenavent de Segrià|33|25\nBenifallet|09|43\nBenissanet|30|43\nBerga|14|08\nBesalú|19|17\nBescanó|20|17\nBeuda|19|17\nBigues i Riells del Fai|41|08\nBiosca|35|25\nBiure|02|17\nBlancafort|16|43\nBlanes|34|17\nBoadella i les Escaules|02|17\nBolvir|15|17\nBonastre|12|43\nBordils|20|17\nBorrassà|02|17\nBorredà|14|08\nBossòst|39|25\nBot|37|43\nBotarell|08|43\nBovera|18|25\nBreda|34|17\nBrunyola i Sant Martí Sapresa|34|17\nBràfim|01|43\nBàscara|02|17\nCabacés|29|43\nCabanabona|23|25\nCabanelles|02|17\nCabanes|02|17\nCabra del Camp|01|43\nCabrera d\'Anoia|06|08\nCabrera de Mar|21|08\nCabrils|21|08\nCabó|04|25\nCadaqués|02|17\nCalaf|06|08\nCalafell|12|43\nCalders|42|08\nCaldes d\'Estrac|21|08\nCaldes de Malavella|34|17\nCaldes de Montbui|41|08\nCalella|21|08\nCalldetenes|24|08\nCallús|07|08\nCalonge de Segarra|06|08\nCalonge i Sant Antoni|10|17\nCamarasa|23|25\nCamarles|09|43\nCambrils|08|43\nCampdevànol|31|17\nCampelles|31|17\nCampins|41|08\nCampllong|20|17\nCamprodon|31|17\nCamós|28|17\nCanejan|39|25\nCanet d\'Adri|20|17\nCanet de Mar|21|08\nCanovelles|41|08\nCantallops|02|17\nCanyelles|17|08\nCapafonts|08|43\nCapellades|06|08\nCapmany|02|17\nCapolat|14|08\nCapçanes|29|43\nCardedeu|41|08\nCardona|07|08\nCarme|06|08\nCaseres|37|43\nCasserres|14|08\nCassà de la Selva|20|17\nCastell d\'Aro, Platja d\'Aro i s\'Agaró|10|17\nCastell de Mur|25|25\nCastell de l\'Areny|14|08\nCastellar de la Ribera|35|25\nCastellar de n\'Hug|14|08\nCastellar del Riu|14|08\nCastellar del Vallès|40|08\nCastellbell i el Vilar|07|08\nCastellbisbal|40|08\nCastellcir|42|08\nCastelldans|18|25\nCastelldefels|11|08\nCastellet i la Gornal|03|08\nCastellfollit de Riubregós|06|08\nCastellfollit de la Roca|19|17\nCastellfollit del Boix|07|08\nCastellgalí|07|08\nCastellnou de Bages|07|08\nCastellnou de Seana|27|25\nCastellolí|06|08\nCastellserà|38|25\nCastellterçol|42|08\nCastellvell del Camp|08|43\nCastellví de Rosanes|11|08\nCastellví de la Marca|03|08\nCastelló d\'Empúries|02|17\nCastelló de Farfanya|23|25\nCava|04|25\nCelrà|20|17\nCentelles|24|08\nCercs|14|08\nCerdanyola del Vallès|40|08\nCervelló|11|08\nCervera|32|25\nCervià de Ter|20|17\nCervià de les Garrigues|18|25\nCistella|02|17\nCiutadilla|38|25\nClariana de Cardener|35|25\nColera|02|17\nColl de Nargó|04|25\nCollbató|11|08\nColldejou|08|43\nCollsuspina|42|08\nColomers|10|17\nConca de Dalt|25|25\nConesa|16|43\nConstantí|36|43\nCopons|06|08\nCorbera d\'Ebre|37|43\nCorbera de Llobregat|11|08\nCorbins|33|25\nCornellà de Llobregat|11|08\nCornellà del Terri|28|17\nCornudella de Montsant|29|43\nCorçà|10|17\nCreixell|36|43\nCrespià|28|17\nCruïlles, Monells i Sant Sadurní de l\'Heura|10|17\nCubelles|17|08\nCubells|23|25\nCunit|12|43\nCànoves i Samalús|41|08\nDarnius|02|17\nDas|15|17\nDeltebre|09|43\nDosrius|21|08\nDuesaigües|08|43\nEs Bòrdes|39|25\nEsparreguera|11|08\nEspinelves|24|17\nEsplugues de Llobregat|11|08\nEspolla|02|17\nEsponellà|28|17\nEspot|26|25\nEstamariu|04|25\nEstaràs|32|25\nEsterri d\'Àneu|26|25\nEsterri de Cardós|26|25\nFalset|29|43\nFarrera|26|25\nFigaró-Montmany|41|08\nFigueres|02|17\nFiguerola del Camp|01|43\nFlaçà|20|17\nFlix|30|43\nFogars de Montclús|41|08\nFogars de la Selva|34|08\nFoixà|10|17\nFolgueroles|24|08\nFondarella|27|25\nFonollosa|07|08\nFont-rubí|03|08\nFontanals de Cerdanya|15|17\nFontanilles|10|17\nFontcoberta|28|17\nForadada|23|25\nForallac|10|17\nFornells de la Selva|20|17\nFortià|02|17\nForès|16|43\nFreginals|22|43\nFulleda|18|25\nFígols|14|08\nFígols i Alinyà|04|25\nGaià|07|08\nGallifa|40|08\nGandesa|37|43\nGarcia|30|43\nGarrigoles|10|17\nGarriguella|02|17\nGarrigàs|02|17\nGavet de la Conca|25|25\nGavà|11|08\nGelida|03|08\nGer|15|17\nGimenells i el Pla de la Font|33|25\nGinestar|30|43\nGirona|20|17\nGironella|14|08\nGisclareny|14|08\nGodall|22|43\nGolmés|27|25\nGombrèn|31|17\nGranera|42|08\nGranollers|41|08\nGranyanella|32|25\nGranyena de Segarra|32|25\nGranyena de les Garrigues|18|25\nGratallops|29|43\nGualba|41|08\nGualta|10|17\nGuardiola de Berguedà|14|08\nGuils de Cerdanya|15|17\nGuimerà|38|25\nGuissona|32|25\nGuixers|35|25\nGurb|24|08\nGósol|14|25\nHorta de Sant Joan|37|43\nHostalric|34|17\nIgualada|06|08\nIsona i Conca Dellà|25|25\nIsòvol|15|17\nIvars d\'Urgell|27|25\nIvars de Noguera|23|25\nIvorra|32|25\nJafre|10|17\nJorba|06|08\nJosa i Tuixén|04|25\nJuià|20|17\nJuncosa|18|25\nJuneda|18|25\nLes|39|25\nLinyola|27|25\nLladorre|26|25\nLladurs|35|25\nLladó|02|17\nLlagostera|20|17\nLlambilles|20|17\nLlanars|31|17\nLlançà|02|17\nLlardecans|33|25\nLlavorsí|26|25\nLleida|33|25\nLlers|02|17\nLles de Cerdanya|15|25\nLlimiana|25|25\nLlinars del Vallès|41|08\nLliçà d\'Amunt|41|08\nLliçà de Vall|41|08\nLlobera|35|25\nLlorac|16|43\nLlorenç del Penedès|12|43\nLloret de Mar|34|17\nLluçà|43|08\nLlívia|15|17\nMadremanya|20|17\nMaials|33|25\nMaià de Montcal|19|17\nMaldà|38|25\nMalgrat de Mar|21|08\nMalla|24|08\nManlleu|24|08\nManresa|07|08\nMargalef|29|43\nMarganell|07|08\nMartorell|11|08\nMartorelles|41|08\nMarçà|29|43\nMas de Barberans|22|43\nMasarac i Vilarnadal|02|17\nMasdenverge|22|43\nMasllorenç|12|43\nMaspujols|08|43\nMasquefa|06|08\nMassalcoreig|33|25\nMassanes|34|17\nMassoteres|32|25\nMatadepera|40|08\nMataró|21|08\nMaçanet de Cabrenys|02|17\nMaçanet de la Selva|34|17\nMediona|03|08\nMenàrguens|23|25\nMeranges|15|17\nMieres|19|17\nMiralcamp|27|25\nMiravet|30|43\nMoià|42|08\nMolins de Rei|11|08\nMollerussa|27|25\nMollet de Peralada|02|17\nMollet del Vallès|41|08\nMolló|31|17\nMonistrol de Calders|42|08\nMonistrol de Montserrat|07|08\nMont-ral|01|43\nMont-ras|10|17\nMont-roig del Camp|08|43\nMontagut i Oix|19|17\nMontblanc|16|43\nMontbrió del Camp|08|43\nMontcada i Reixac|40|08\nMontclar|14|08\nMontellà i Martinet|15|25\nMontesquiu|24|08\nMontferrer i Castellbò|04|25\nMontferri|01|43\nMontgai|23|25\nMontgat|21|08\nMontmajor|14|08\nMontmaneu|06|08\nMontmeló|41|08\nMontoliu de Lleida|33|25\nMontoliu de Segarra|32|25\nMontornès de Segarra|32|25\nMontornès del Vallès|41|08\nMontseny|41|08\nMuntanyola|24|08\nMura|07|08\nMóra d\'Ebre|30|43\nMóra la Nova|30|43\nNalec|38|25\nNaut Aran|39|25\nNavarcles|07|08\nNavata|02|17\nNavàs|07|08\nNavès|35|25\nNulles|01|43\nOdèn|35|25\nOgassa|31|17\nOlesa de Bonesvalls|03|08\nOlesa de Montserrat|11|08\nOliana|04|25\nOliola|23|25\nOlius|35|25\nOlivella|17|08\nOlost|43|08\nOlot|19|17\nOlvan|14|08\nOlèrdola|03|08\nOrdis|02|17\nOrganyà|04|25\nOristà|43|08\nOrpí|06|08\nOrís|24|08\nOs de Balaguer|23|25\nOsor|34|17\nOssó de Sió|38|25\nPacs del Penedès|03|08\nPalafolls|21|08\nPalafrugell|10|17\nPalamós i Sant Joan|10|17\nPalau de Santa Eulàlia|02|17\nPalau-sator|10|17\nPalau-saverdera|02|17\nPalau-solità i Plegamans|40|08\nPallejà|11|08\nPalol de Revardit|28|17\nPals|10|17\nPardines|31|17\nParets del Vallès|41|08\nParlavà|10|17\nPassanant i Belltall|16|43\nPau|02|17\nPaüls|09|43\nPedret i Marzà|02|17\nPenelles|23|25\nPerafita|43|08\nPerafort|36|43\nPeralada|02|17\nPeramola|04|25\nPiera|06|08\nPineda de Mar|21|08\nPinell de Solsonès|35|25\nPinós|35|25\nPira|16|43\nPlanoles|31|17\nPoboleda|29|43\nPolinyà|40|08\nPont de Molins|02|17\nPontils|16|43\nPontons|03|08\nPonts|23|25\nPontós|02|17\nPorqueres|28|17\nPorrera|29|43\nPortbou|02|17\nPradell de la Teixeta|29|43\nPrades|08|43\nPrat de Comte|37|43\nPratdip|08|43\nPrats de Lluçanès|43|08\nPrats i Sansor|15|25\nPreixana|38|25\nPreixens|23|25\nPremià de Dalt|21|08\nPremià de Mar|21|08\nPrullans|15|25\nPuig-reig|14|08\nPuigcerdà|15|17\nPuigdàlber|03|08\nPuiggròs|18|25\nPuigpelat|01|43\nPuigverd d\'Agramunt|38|25\nPuigverd de Lleida|33|25\nPujalt|06|08\nQuart|20|17\nQueralbs|31|17\nQuerol|01|43\nRabós|02|17\nRajadell|07|08\nRasquera|30|43\nRegencós|10|17\nRellinars|40|08\nRenau|36|43\nReus|08|43\nRialp|26|25\nRiba-roja d\'Ebre|30|43\nRibera d\'Ondara|32|25\nRibera d\'Urgellet|04|25\nRibes de Freser|31|17\nRiells i Viabrea|34|17\nRiner|35|25\nRipoll|31|17\nRipollet|40|08\nRiu de Cerdanya|15|25\nRiudarenes|34|17\nRiudaura|19|17\nRiudecanyes|08|43\nRiudecols|08|43\nRiudellots de la Selva|34|17\nRiudoms|08|43\nRiumors|02|17\nRocafort de Queralt|16|43\nRoda de Berà|36|43\nRoda de Ter|24|08\nRodonyà|01|43\nRoquetes|09|43\nRoses|02|17\nRosselló|33|25\nRubió|06|08\nRubí|40|08\nRupit i Pruit|24|08\nRupià|10|17\nSabadell|40|08\nSagàs|14|08\nSaldes|14|08\nSales de Llierca|19|17\nSallent|07|08\nSalomó|36|43\nSalou|36|43\nSalt|20|17\nSalàs de Pallars|25|25\nSanaüja|32|25\nSant Adrià de Besòs|13|08\nSant Agustí de Lluçanès|24|08\nSant Andreu Salou|20|17\nSant Andreu de Llavaneres|21|08\nSant Andreu de la Barca|11|08\nSant Aniol de Finestres|19|17\nSant Antoni de Vilamajor|41|08\nSant Bartomeu del Grau|24|08\nSant Boi de Llobregat|11|08\nSant Boi de Lluçanès|24|08\nSant Cebrià de Vallalta|21|08\nSant Celoni|41|08\nSant Climent Sescebes|02|17\nSant Climent de Llobregat|11|08\nSant Cugat Sesgarrigues|03|08\nSant Cugat del Vallès|40|08\nSant Esteve Sesrovires|11|08\nSant Esteve de Palautordera|41|08\nSant Esteve de la Sarga|25|25\nSant Feliu Sasserra|07|08\nSant Feliu de Buixalleu|34|17\nSant Feliu de Codines|41|08\nSant Feliu de Guíxols|10|17\nSant Feliu de Llobregat|11|08\nSant Feliu de Pallerols|19|17\nSant Ferriol|19|17\nSant Fost de Campsentelles|41|08\nSant Fruitós de Bages|07|08\nSant Gregori|20|17\nSant Guim de Freixenet|32|25\nSant Guim de la Plana|32|25\nSant Hilari Sacalm|34|17\nSant Hipòlit de Voltregà|24|08\nSant Iscle de Vallalta|21|08\nSant Jaume d\'Enveja|22|43\nSant Jaume de Frontanyà|14|08\nSant Jaume de Llierca|19|17\nSant Jaume dels Domenys|12|43\nSant Joan Despí|11|08\nSant Joan de Mollet|20|17\nSant Joan de Vilatorrada|07|08\nSant Joan de les Abadesses|31|17\nSant Joan les Fonts|19|17\nSant Jordi Desvalls|20|17\nSant Julià de Cerdanyola|14|08\nSant Julià de Ramis|20|17\nSant Julià de Vilatorta|24|08\nSant Julià del Llor i Bonmatí|34|17\nSant Just Desvern|11|08\nSant Llorenç Savall|40|08\nSant Llorenç d\'Hortons|03|08\nSant Llorenç de Morunys|35|25\nSant Llorenç de la Muga|02|17\nSant Martí Sarroca|03|08\nSant Martí Sesgueioles|06|08\nSant Martí Vell|20|17\nSant Martí d\'Albars|43|08\nSant Martí de Centelles|24|08\nSant Martí de Llémena|20|17\nSant Martí de Riucorb|38|25\nSant Martí de Tous|06|08\nSant Mateu de Bages|07|08\nSant Miquel de Campmajor|28|17\nSant Miquel de Fluvià|02|17\nSant Mori|02|17\nSant Pau de Segúries|31|17\nSant Pere Pescador|02|17\nSant Pere Sallavinera|06|08\nSant Pere de Ribes|17|08\nSant Pere de Riudebitlles|03|08\nSant Pere de Torelló|24|08\nSant Pere de Vilamajor|41|08\nSant Pol de Mar|21|08\nSant Quintí de Mediona|03|08\nSant Quirze Safaja|42|08\nSant Quirze de Besora|24|08\nSant Quirze del Vallès|40|08\nSant Ramon|32|25\nSant Sadurní d\'Anoia|03|08\nSant Sadurní d\'Osormort|24|08\nSant Salvador de Guardiola|07|08\nSant Vicenç de Castellet|07|08\nSant Vicenç de Montalt|21|08\nSant Vicenç de Torelló|24|08\nSant Vicenç dels Horts|11|08\nSanta Bàrbara|22|43\nSanta Cecília de Voltregà|24|08\nSanta Coloma de Cervelló|11|08\nSanta Coloma de Farners|34|17\nSanta Coloma de Gramenet|13|08\nSanta Coloma de Queralt|16|43\nSanta Cristina d\'Aro|10|17\nSanta Eugènia de Berga|24|08\nSanta Eulàlia de Riuprimer|24|08\nSanta Eulàlia de Ronçana|41|08\nSanta Fe del Penedès|03|08\nSanta Llogaia d\'Àlguema|02|17\nSanta Margarida de Montbui|06|08\nSanta Margarida i els Monjos|03|08\nSanta Maria d\'Oló|42|08\nSanta Maria de Besora|24|08\nSanta Maria de Martorelles|41|08\nSanta Maria de Merlès|14|08\nSanta Maria de Miralles|06|08\nSanta Maria de Palautordera|41|08\nSanta Oliva|12|43\nSanta Pau|19|17\nSanta Perpètua de Mogoda|40|08\nSanta Susanna|21|08\nSantpedor|07|08\nSarral|16|43\nSarrià de Ter|20|17\nSarroca de Bellera|25|25\nSarroca de Lleida|33|25\nSaus, Camallera i Llampaies|02|17\nSavallà del Comtat|16|43\nSenan|16|43\nSenterada|25|25\nSentmenat|40|08\nSerinyà|28|17\nSerra de Daró|10|17\nSeròs|33|25\nSetcases|31|17\nSeva|24|08\nSidamon|27|25\nSils|34|17\nSitges|17|08\nSiurana|02|17\nSobremunt|43|08\nSolivella|16|43\nSolsona|35|25\nSora|24|08\nSoriguera|26|25\nSort|26|25\nSoses|33|25\nSubirats|03|08\nSudanell|33|25\nSunyer|33|25\nSusqueda|34|17\nSúria|07|08\nTagamanent|41|08\nTalamanca|07|08\nTalarn|25|25\nTalavera|32|25\nTaradell|24|08\nTarragona|36|43\nTarroja de Segarra|32|25\nTarrés|18|25\nTavertet|24|08\nTavèrnoles|24|08\nTeià|21|08\nTerrades|02|17\nTerrassa|40|08\nTiana|21|08\nTiurana|23|25\nTivenys|09|43\nTivissa|30|43\nTona|24|08\nTordera|21|08\nTorelló|24|08\nTornabous|38|25\nTorre-serona|33|25\nTorrebesses|33|25\nTorredembarra|36|43\nTorrefarrera|33|25\nTorrefeta i Florejacs|32|25\nTorregrossa|27|25\nTorrelameu|23|25\nTorrelavit|03|08\nTorrelles de Foix|03|08\nTorrelles de Llobregat|11|08\nTorrent|10|17\nTorres de Segre|33|25\nTorroella de Fluvià|02|17\nTorroella de Montgrí|10|17\nTorroja del Priorat|29|43\nTortellà|19|17\nTortosa|09|43\nTorà|35|25\nToses|31|17\nTossa de Mar|34|17\nTremp|25|25\nTàrrega|38|25\nTérmens|23|25\nTírvia|26|25\nUllastrell|40|08\nUllastret|10|17\nUlldecona|22|43\nUlldemolins|29|43\nUllà|10|17\nUltramort|10|17\nUrús|15|17\nVacarisses|40|08\nVall de Cardós|26|25\nVall-llobrega|10|17\nVallbona d\'Anoia|06|08\nVallbona de les Monges|38|25\nVallcebre|14|08\nVallclara|16|43\nVallfogona de Balaguer|23|25\nVallfogona de Ripollès|31|17\nVallfogona de Riucorb|16|43\nVallgorguina|41|08\nVallirana|11|08\nVallmoll|01|43\nVallromanes|41|08\nValls|01|43\nVandellòs i l\'Hospitalet de l\'Infant|08|43\nVeciana|06|08\nVentalló|02|17\nVerdú|38|25\nVerges|10|17\nVespella de Gaià|36|43\nVic|24|08\nVidreres|34|17\nVidrà|24|17\nVielha e Mijaran|39|25\nVila-rodona|01|43\nVila-sacra|02|17\nVila-sana|27|25\nVila-seca|36|43\nVilabella|01|43\nVilabertran|02|17\nVilablareix|20|17\nVilada|14|08\nViladamat|02|17\nViladasens|20|17\nViladecans|11|08\nViladecavalls|40|08\nVilademuls|28|17\nViladrau|24|17\nVilafant|02|17\nVilafranca del Penedès|03|08\nVilagrassa|38|25\nVilajuïga|02|17\nVilalba Sasserra|41|08\nVilalba dels Arcs|37|43\nVilaller|05|25\nVilallonga de Ter|31|17\nVilallonga del Camp|36|43\nVilamacolum|02|17\nVilamalla|02|17\nVilamaniscle|02|17\nVilamòs|39|25\nVilanant|02|17\nVilanova d\'Escornalbou|08|43\nVilanova de Bellpuig|27|25\nVilanova de Meià|23|25\nVilanova de Prades|16|43\nVilanova de Sau|24|08\nVilanova de Segrià|33|25\nVilanova de l\'Aguda|23|25\nVilanova de la Barca|33|25\nVilanova del Camí|06|08\nVilanova del Vallès|41|08\nVilanova i la Geltrú|17|08\nVilaplana|08|43\nVilassar de Dalt|21|08\nVilassar de Mar|21|08\nVilaverd|16|43\nVilaür|02|17\nVilobí d\'Onyar|34|17\nVilobí del Penedès|03|08\nVilopriu|10|17\nVimbodí i Poblet|16|43\nVinaixa|18|25\nVinebre|30|43\nVinyols i els Arcs|08|43\nViver i Serrateix|14|08\nXerta|09|43\nel Bruc|06|08\nel Brull|24|08\nel Catllar|36|43\nel Cogul|18|25\nel Far d\'Empordà|02|17\nel Lloar|29|43\nel Masnou|21|08\nel Masroig|29|43\nel Milà|01|43\nel Molar|29|43\nel Montmell|12|43\nel Morell|36|43\nel Palau d\'Anglesola|27|25\nel Papiol|11|08\nel Perelló|09|43\nel Pinell de Brai|37|43\nel Pla de Santa Maria|01|43\nel Pla del Penedès|03|08\nel Poal|27|25\nel Pont d\'Armentera|01|43\nel Pont de Bar|04|25\nel Pont de Suert|05|25\nel Pont de Vilomara i Rocafort|07|08\nel Port de la Selva|02|17\nel Prat de Llobregat|11|08\nel Rourell|01|43\nel Soleràs|18|25\nel Vendrell|12|43\nel Vilosell|18|25\nels Alamús|33|25\nels Garidells|01|43\nels Guiamets|29|43\nels Hostalets de Pierola|06|08\nels Omellons|18|25\nels Omells de na Gaia|38|25\nels Pallaresos|36|43\nels Plans de Sió|32|25\nels Prats de Rei|06|08\nels Torms|18|25\nl\'Albagés|18|25\nl\'Albi|18|25\nl\'Albiol|08|43\nl\'Aldea|09|43\nl\'Aleixar|08|43\nl\'Ametlla de Mar|09|43\nl\'Ametlla del Vallès|41|08\nl\'Ampolla|09|43\nl\'Arboç|12|43\nl\'Argentera|08|43\nl\'Armentera|02|17\nl\'Escala|02|17\nl\'Espluga Calba|18|25\nl\'Espluga de Francolí|16|43\nl\'Espunyola|14|08\nl\'Esquirol|24|08\nl\'Estany|42|08\nl\'Hospitalet de Llobregat|13|08\nla Baronia de Rialb|23|25\nla Bisbal d\'Empordà|10|17\nla Bisbal de Montsant|29|43\nla Bisbal del Penedès|12|43\nla Canonja|36|43\nla Cellera de Ter|34|17\nla Coma i la Pedra|35|25\nla Fatarella|37|43\nla Febró|08|43\nla Figuera|29|43\nla Floresta|18|25\nla Fuliola|38|25\nla Galera|22|43\nla Garriga|41|08\nla Granada|03|08\nla Granadella|18|25\nla Granja d\'Escarp|33|25\nla Guingueta d\'Àneu|26|25\nla Jonquera|02|17\nla Llacuna|06|08\nla Llagosta|41|08\nla Masó|01|43\nla Molsosa|35|25\nla Morera de Montsant|29|43\nla Nou de Berguedà|14|08\nla Nou de Gaià|36|43\nla Palma d\'Ebre|30|43\nla Palma de Cervelló|11|08\nla Pera|10|17\nla Pobla de Claramunt|06|08\nla Pobla de Cérvoles|18|25\nla Pobla de Lillet|14|08\nla Pobla de Mafumet|36|43\nla Pobla de Massaluca|37|43\nla Pobla de Montornès|36|43\nla Pobla de Segur|25|25\nla Portella|33|25\nla Quar|14|08\nla Riba|01|43\nla Riera de Gaià|36|43\nla Roca del Vallès|41|08\nla Ràpita|22|43\nla Secuita|36|43\nla Selva de Mar|02|17\nla Selva del Camp|08|43\nla Sentiu de Sió|23|25\nla Seu d\'Urgell|04|25\nla Sénia|22|43\nla Tallada d\'Empordà|10|17\nla Torre de Cabdella|25|25\nla Torre de Claramunt|06|08\nla Torre de Fontaubella|29|43\nla Torre de l\'Espanyol|30|43\nla Vajol|02|17\nla Vall d\'en Bas|19|17\nla Vall de Bianya|19|17\nla Vall de Boí|05|25\nla Vansa i Fórnols|04|25\nla Vilella Alta|29|43\nla Vilella Baixa|29|43\nles Avellanes i Santa Linya|23|25\nles Borges Blanques|18|25\nles Borges del Camp|08|43\nles Cabanyes|03|08\nles Franqueses del Vallès|41|08\nles Llosses|31|17\nles Masies de Roda|24|08\nles Masies de Voltregà|24|08\nles Oluges|32|25\nles Piles|16|43\nles Planes d\'Hostoles|19|17\nles Preses|19|17\nles Valls d\'Aguilar|04|25\nles Valls de Valira|04|25\nÀger|23|25\nÒdena|06|08\nÒrrius|21|08';

    // Comarques (o illes) dels altres territoris, amb la província.
    const OTHER_COMARQUES = {
        val: [
            ['els Ports', 'Castelló'], ["l'Alt Maestrat", 'Castelló'], ['el Baix Maestrat', 'Castelló'],
            ["l'Alcalatén", 'Castelló'], ['la Plana Alta', 'Castelló'], ['la Plana Baixa', 'Castelló'],
            ["l'Alt Millars", 'Castelló'], ["l'Alt Palància", 'Castelló'],
            ["el Racó d'Ademús", 'València'], ['els Serrans', 'València'], ['el Camp de Túria', 'València'],
            ['el Camp de Morvedre', 'València'], ["l'Horta Nord", 'València'],
            ["l'Horta Sud", 'València'], ['València', 'València'], ["la Plana d'Utiel-Requena", 'València'],
            ['la Foia de Bunyol', 'València'], ['la Ribera Alta', 'València'], ['la Ribera Baixa', 'València'],
            ['la Vall de Cofrents', 'València'], ['la Canal de Navarrés', 'València'], ['la Costera', 'València'],
            ["la Vall d'Albaida", 'València'], ['la Safor', 'València'],
            ['el Comtat', 'Alacant'], ["l'Alcoià", 'Alacant'], ["l'Alt Vinalopó", 'Alacant'],
            ['el Vinalopó Mitjà', 'Alacant'], ['la Marina Alta', 'Alacant'], ['la Marina Baixa', 'Alacant'],
            ["l'Alacantí", 'Alacant'], ['el Baix Vinalopó', 'Alacant'], ['el Baix Segura', 'Alacant']
        ],
        bal: [['Mallorca', 'Illes Balears'], ['Menorca', 'Illes Balears'], ['Eivissa', 'Illes Balears'], ['Formentera', 'Illes Balears']],
        and: [['Andorra', 'Andorra']],
        nord: [
            ['el Rosselló', 'els Pirineus Orientals'], ['el Conflent', 'els Pirineus Orientals'],
            ['el Vallespir', 'els Pirineus Orientals'], ['el Capcir', 'els Pirineus Orientals'],
            ["l'Alta Cerdanya", 'els Pirineus Orientals'], ['la Fenolleda', 'els Pirineus Orientals']
        ],
        franja: [
            ['la Ribagorça', 'Osca'], ['la Llitera', 'Osca'], ['el Baix Cinca', 'Osca'],
            ['el Matarranya', 'Terol'], ['el Baix Aragó-Casp', 'Saragossa']
        ],
        alguer: [["l'Alguer", 'Sàsser']]
    };
    // Municipis dels altres territoris: «nom|comarca» (índex a OTHER_COMARQUES)
    // o «nom|comarca|província» si no és la de la comarca (Mequinensa, del Baix
    // Cinca, és de Saragossa).
    const OTHER_MUNICIPIS_BY_COMARCA = {
        val:
            'Ademús|8\nAdor|23\nAgost|30\nAgres|24\nAgullent|22\nAielo de Malferit|22\nAielo de Rugat|22\nAigües|30\n' +
            'Aiora|19\nAiòder|6\nAlacant|30\nAlaquàs|13\nAlbaida|22\nAlbal|13\nAlbalat de la Ribera|18\n' +
            'Albalat dels Sorells|12\nAlbalat dels Tarongers|11\nAlbatera|32\nAlberic|17\nAlbocàsser|1\nAlboraia|12\n' +
            'Alboraig|16\nAlbuixec|12\nAlcalalí|28\nAlcalà de Xivert|2\nAlcoi|25\nAlcoleja|24\nAlcosser|24\n' +
            'Alcàntera de Xúquer|17\nAlcàsser|13\nAldaia|13\nAlfafar|13\nAlfafara|24\nAlfara de la Baronia|11\n' +
            'Alfara del Patriarca|12\nAlfarb|17\nAlfarrasí|22\nAlfauir|23\nAlfondeguilla|5\nAlgar de Palància|11\n' +
            'Algemesí|17\nAlginet|17\nAlgorfa|32\nAlgímia d\'Alfara|11\nAlgímia d\'Almonesir|7\nAlmassora|4\nAlmedíxer|7\n' +
            'Almenara|5\nAlmiserà|23\nAlmoines|23\nAlmoradí|32\nAlmudaina|24\nAlmussafes|18\nAlmàssera|12\nAlpont|9\n' +
            'Altea|29\nAltura|7\nAlzira|17\nAndilla|9\nAnna|20\nAntella|17\nAranyel|6\nAres del Maestrat|1\n' +
            'Ares dels Oms|9\nArgeleta|6\nArtana|5\nAsp|27\nAssuévar|7\nAtzeneta d\'Albaida|22\nAtzeneta del Maestrat|1\n' +
            'Aín|5\nBalones|24\nBanyeres de Mariola|25\nBarraques|7\nBarx|23\nBarxeta|21\nBegís|7\nBellreguard|23\n' +
            'Bellús|22\nBenafer|7\nBenafigos|1\nBenaguasil|10\nBenaixeve|9\nBenasau|24\nBenassal|1\nBenavites|11\n' +
            'Beneixama|26\nBeneixida|17\nBenejússer|32\nBenetússer|13\nBenferri|32\nBeniarbeig|28\nBeniardà|29\n' +
            'Beniarjó|23\nBeniarrés|24\nBeniatjar|22\nBenicarló|2\nBenicolet|22\nBenicull de Xúquer|18\nBenicàssim|4\n' +
            'Benidoleig|28\nBenidorm|29\nBenifairó de la Valldigna|23\nBenifairó de les Valls|11\nBenifaió|17\n' +
            'Benifallim|25\nBenifato|29\nBeniflà|23\nBenigembla|28\nBenigànim|22\nBenijòfer|32\nBenilloba|24\nBenillup|24\n' +
            'Benimantell|29\nBenimarfull|24\nBenimassot|24\nBenimeli|28\nBenimodo|17\nBenimuslem|17\nBeniparrell|13\n' +
            'Benirredrà|23\nBenissa|28\nBenissanó|10\nBenissoda|22\nBenissuera|22\nBenlloc|4\nBetxí|5\nBiar|26\nBicorb|20\n' +
            'Bigastre|32\nBocairent|22\nBolbait|20\nBolulla|29\nBonrepòs i Mirambell|12\nBorriana|5\nBorriol|4\nBufali|22\n' +
            'Bugarra|9\nBunyol|16\nBurjassot|12\nBusot|30\nBèlgida|22\nBétera|10\nCabanes|4\nCalles|9\n' +
            'Callosa d\'en Sarrià|29\nCallosa de Segura|32\nCalp|28\nCamporrobles|15\nCanals|21\nCanet d\'en Berenguer|11\n' +
            'Canet lo Roig|2\nCarcaixent|17\nCarlet|17\nCarrícola|22\nCases Altes|8\nCases Baixes|8\nCasinos|10\n' +
            'Castalla|25\nCastell de Cabres|2\nCastell de Castells|28\nCastellfabib|8\nCastellfort|0\nCastellnou|7\n' +
            'Castellonet de la Conquesta|23\nCastelló|17\nCastelló de Rugat|22\nCastelló de la Plana|4\nCatadau|17\n' +
            'Catarroja|13\nCatral|32\nCatí|1\nCaudete de las Fuentes|15\nCaudiel|7\nCerdà|21\nCervera del Maestrat|2\n' +
            'Cinctorres|0\nCirat|6\nCocentaina|24\nCofrents|19\nCoix|32\nConfrides|29\nCorbera|18\nCortes d\'Arenós|6\n' +
            'Cortes de Pallars|19\nCostur|3\nCotes|17\nCrevillent|31\nCulla|1\nCullera|18\nCàlig|2\nCàrcer|17\n' +
            'Daia Nova|32\nDaia Vella|32\nDaimús|23\nDolors|32\nDomenyo|9\nDosaigües|16\nDénia|28\nElda|27\nElx|31\n' +
            'Emperador|12\nEslida|5\nEspadella|6\nEstivella|11\nEstubeny|21\nFageca|24\nFamorca|24\nFanzara|6\nFaura|11\n' +
            'Favara|18\nFigueres|7\nFigueroles|3\nFigueroles de Domenyo|9\nFinestrat|29\nFoios|12\n' +
            'Fontanars dels Alforins|22\nFormentera del Segura|32\nFortaleny|18\nFuenterrobles|15\nGaianes|24\nGaibiel|7\n' +
            'Gandia|23\nGata de Gorgos|28\nGavarda|17\nGeldo|7\nGilet|11\nGodella|12\nGodelleta|16\nGorga|24\n' +
            'Guadassuar|17\nGuadasséquies|22\nGuardamar de la Safor|23\nGuardamar del Segura|32\nGàtova|10\nHerbers|0\n' +
            'Ibi|25\nIàtova|16\nLlanera de Ranes|21\nLlaurí|18\nLlocnou d\'en Fenollet|21\nLlocnou de Sant Jeroni|23\n' +
            'Llocnou de la Corona|13\nLlombai|17\nLlucena|3\nLludient|6\nLlutxent|22\nLlíber|28\nLlíria|10\nLoriguilla|10\n' +
            'Los Montesinos|32\nMacastre|16\nManises|13\nManuel|17\nMarines|10\nMassalavés|17\nMassalfassar|12\n' +
            'Massamagrell|12\nMassanassa|13\nMatet|7\nMeliana|12\nMillars|20\nMillena|24\nMiramar|23\nMislata|13\n' +
            'Moixent|21\nMoncofa|5\nMontanejos|6\nMontant|6\nMontaverner|22\nMontcada|12\nMontesa|21\nMontfort|27\n' +
            'Montitxelvo|22\nMontroi|17\nMontserrat|17\nMonòver|27\nMorella|0\nMurla|28\nMuro d\'Alcoi|24\nMuseros|12\n' +
            'Mutxamel|30\nNavaixes|7\nNavarrés|20\nNovelda|27\nNovetlè|21\nNules|5\nNàquera|10\nOliva|23\nOlocau|10\n' +
            'Olocau del Rei|0\nOnda|5\nOndara|28\nOnil|25\nOntinyent|22\nOrba|28\nOriola|32\nOrpesa|4\nOrxeta|29\nOtos|22\n' +
            'Paiporta|13\nPalanques|0\nPalma de Gandia|23\nPalmera|23\nParcent|28\nPaterna|12\nPavies|7\nPedralba|9\n' +
            'Pedreguer|28\nPego|28\nPenàguila|25\nPeníscola|2\nPetrer|27\nPetrés|11\nPicanya|13\nPicassent|13\nPiles|23\n' +
            'Pina|7\nPinet|22\nPlanes|24\nPolinyà de Xúquer|18\nPolop|29\nPortell de Morella|0\nPotries|23\nPuçol|12\n' +
            'Quart de Poblet|13\nQuart de les Valls|11\nQuartell|11\nQuatretonda|22\nQuatretondeta|24\nQuesa|20\nRafal|32\n' +
            'Rafelbunyol|12\nRafelcofer|23\nRafelguaraf|17\nReal|17\nRedovà|32\nRelleu|29\nRequena|15\n' +
            'Riba-roja de Túria|10\nRibesalbes|5\nRiola|18\nRocafort|12\nRojals|32\nRossell|2\nRotglà i Corberà|21\n' +
            'Rugat|22\nRòtova|23\nSacanyet|7\nSagra|28\nSagunt|11\nSaix|26\nSalem|22\nSalines|26\nSanet i els Negrals|28\n' +
            'Sant Antoni de Benaixeve|10\nSant Fulgenci|32\nSant Isidre|32\nSant Joan d\'Alacant|30\nSant Joan de Moró|4\n' +
            'Sant Joanet|17\nSant Jordi|2\nSant Mateu|2\nSant Miquel de les Salines|32\nSant Rafel del Riu|2\n' +
            'Sant Vicent del Raspeig|30\nSanta Magdalena de Polpís|2\nSanta Pola|31\nSedaví|13\nSegart|11\nSella|29\n' +
            'Sellent|17\nSempere|22\nSenija|28\nSenyera|17\nSerra|10\nSetaigües|16\nSilla|13\nSimat de la Valldigna|23\n' +
            'Sinarques|15\nSogorb|7\nSollana|18\nSoneja|7\nSorita|0\nSot de Ferrer|7\nSot de Xera|9\nSucaina|6\nSueca|18\n' +
            'Suera|5\nSumacàrcer|17\nTales|5\nTavernes Blanques|12\nTavernes de la Valldigna|23\nTeresa|7\n' +
            'Teresa de Cofrents|19\nTerrateig|22\nTeulada|28\nTibi|25\nTitaigües|9\nToga|6\nToixa|9\nTollos|24\nTormos|28\n' +
            'Torralba|6\nTorre-xiva|6\nTorrebaixa|8\nTorreblanca|4\nTorrella|21\nTorrent|13\nTorres Torres|11\n' +
            'Torrevella|32\nToràs|7\nTorís|17\nTous|17\nTraiguera|2\nTàrbena|29\nTírig|1\nUtiel|15\nVallada|21\n' +
            'Vallanca|8\nVallat|6\nVallibona|0\nVallés|21\nValència|14\nVenta del Moro|15\nVila-real|5\nVilafamés|4\n' +
            'Vilafermosa|6\nVilafranca|0\nVilallonga|23\nVilamalur|6\nVilamarxant|10\nVilanova d\'Alcolea|4\n' +
            'Vilanova de Viver|6\nVilar de Canes|1\nVillargordo del Cabriel|15\nVillena|26\nVillores|0\nVinalesa|12\n' +
            'Vinaròs|2\nVistabella del Maestrat|3\nViver|7\nXacarella|32\nXalans|19\nXaló|28\nXarafull|19\nXella|20\n' +
            'Xelva|9\nXera|15\nXeraco|23\nXeresa|23\nXert|2\nXest|16\nXestalgar|9\nXilxes|5\nXirivella|13\nXiva|16\n' +
            'Xixona|30\nXodos|3\nXulilla|9\nXàbia|28\nXàtiva|21\nXèrica|7\nXóvar|7\nZarra|19\nel Camp de Mirra|26\n' +
            'el Campello|30\nel Castell de Guadalest|29\nel Castell de Vilamalefa|6\nel Fondó de les Neus|27\n' +
            'el Fondó dels Frares|27\nel Forcall|0\nel Genovés|21\nel Palomar|22\nel Pilar de la Foradada|32\nel Pinós|27\n' +
            'el Poble Nou de Benitatxell|28\nel Puig de Santa Maria|12\nel Real de Gandia|23\nel Ràfol d\'Almúnia|28\n' +
            'el Ràfol de Salem|22\nel Toro|7\nel Verger|28\nel Villar|9\nels Poblets|28\nl\'Alcora|3\nl\'Alcúdia|17\n' +
            'l\'Alcúdia de Crespins|21\nl\'Alcúdia de Veo|5\nl\'Alfàs del Pi|29\nl\'Alguenya|27\nl\'Alqueria d\'Asnar|24\n' +
            'l\'Alqueria de la Comtessa|23\nl\'Atzúbia|28\nl\'Eliana|10\nl\'Olleria|22\nl\'Orxa|24\nl\'Énova|17\nla Canyada|26\n' +
            'la Font d\'en Carròs|23\nla Font de la Figuera|21\nla Font de la Reina|6\nla Granja de Rocamora|32\n' +
            'la Granja de la Costera|21\nla Iessa|9\nla Jana|2\nla Llosa|5\nla Llosa de Ranes|21\nla Llosa del Bisbe|9\n' +
            'la Mata de Morella|0\nla Nucia|29\nla Pobla Llarga|17\nla Pobla Tornesa|4\nla Pobla d\'Arenós|6\n' +
            'la Pobla de Benifassà|2\nla Pobla de Farnals|12\nla Pobla de Sant Miquel|8\nla Pobla de Vallbona|10\n' +
            'la Pobla del Duc|22\nla Romana|27\nla Salzadella|2\nla Serra d\'en Galceran|4\nla Serratella|1\n' +
            'la Todolella|0\nla Torre d\'en Besora|1\nla Torre d\'en Doménec|4\nla Torre de les Maçanes|30\n' +
            'la Vall d\'Alba|4\nla Vall d\'Alcalà|28\nla Vall d\'Almonesir|7\nla Vall d\'Ebo|28\nla Vall d\'Uixó|5\n' +
            'la Vall de Gallinera|28\nla Vall de Laguar|28\nla Vila Joiosa|29\nla Vilavella|5\nles Alcubles|9\n' +
            'les Alqueries|5\nles Coves de Vinromà|4\nles Fonts d\'Aiòder|6\nles Useres|3\nÉnguera|20',
        nord:
            'Aiguatèbia i Talau|1\nAlenyà|0\nAngostrina i Vilanova de les Escaldes|4\nArboçols|1\nArgelers|0\nArles|2\n' +
            'Bages de Rosselló|0\nBaixàs|0\nBanyuls de la Marenda|0\nBanyuls dels Aspres|0\nBao|0\nBolquera|4\nBompàs|0\n' +
            'Brullà|0\nBula d\'Amunt|0\nBulaternera|0\nCabestany|0\nCalce|0\nCalmella|0\nCameles|0\nCampome|1\n' +
            'Canavelles|1\nCanet de Rosselló|0\nCasafabre|0\nCases de Pena|0\nCastell de Vernet|1\n' +
            'Castellnou dels Aspres|0\nCatllà|1\nCaudiers de Conflent|1\nCensà|1\nCeret|2\nCervera de la Marenda|0\n' +
            'Clairà|0\nClarà i Villerac|1\nCodalet|1\nConat|1\nCorbera|0\nCorbera la Cabana|0\nCornellà de Conflent|1\n' +
            'Cornellà de la Ribera|0\nCornellà del Bercol|0\nCortsaví|2\nCostoja|2\nCotlliure|0\nCànoes|0\nDorres|4\n' +
            'Eina|4\nElna|0\nEnveig|4\nEr|4\nEscaró|1\nEspirà de Conflent|1\nEspirà de l\'Aglí|0\nEstagell|0\nEstavar|4\n' +
            'Estoer|1\nEus|1\nFillols|1\nFinestret|1\nFont-rabiosa|3\nFont-romeu, Odelló i Vià|4\nFontpedrosa|1\n' +
            'Formiguera|3\nForques|0\nFullà|1\nGlorianes|1\nIlla|0\nJóc|1\nJújols|1\nLlauró|0\nLlo|4\nLlupià|0\n' +
            'Marqueixanes|1\nMatamala|3\nMentet|1\nMillars|0\nMolig|1\nMontboló|2\nMontescot|0\nMontesquiu d\'Albera|0\n' +
            'Montferrer|2\nMontlluís|4\nMontner|0\nMontoriol|0\nMorellàs i les Illes|2\nMosset|1\nNaüja|4\nNefiac|0\n' +
            'Noedes|1\nNyer|1\nOceja|4\nOleta i Èvol|1\nOms|0\nOrbanyà|1\nOrellà|1\nOrtafà|0\nPalau de Cerdanya|4\n' +
            'Palau del Vidre|0\nParetstortes|0\nPaçà|0\nPerpinyà|0\nPesillà de la Ribera|0\nPi de Conflent|1\nPià|0\n' +
            'Planès|4\nPollestres|0\nPontellà|0\nPorta|4\nPortvendres|0\nPortè|4\nPrada|1\nPrats de Molló i la Presta|2\n' +
            'Prunet i Bellpuig|0\nPuigbalador|3\nQueixàs|0\nRalleu|1\nReal|3\nReiners|2\nRibesaltes|0\nRigardà|1\n' +
            'Rià i Cirac|1\nRodès|1\nSalelles|0\nSallagosa|4\nSalses|0\nSant Andreu de Sureda|0\n' +
            'Sant Cebrià de Rosselló|0\nSant Esteve del Monestir|0\nSant Feliu d\'Amunt|0\nSant Feliu d\'Avall|0\n' +
            'Sant Genís de Fontanes|0\nSant Hipòlit de la Salanca|0\nSant Joan de Pladecorts|2\nSant Joan la Cella|0\n' +
            'Sant Llorenç de Cerdans|2\nSant Llorenç de la Salanca|0\nSant Marçal|0\nSant Miquel de Llotes|0\n' +
            'Sant Nazari de Rosselló|0\nSant Pere dels Forcats|4\nSanta Coloma de Tuïr|0\nSanta Llocaia|4\n' +
            'Santa Maria la Mar|0\nSaorra|1\nSautó|1\nSerdinyà|1\nSerrallonga|2\nSoanyes|1\nSureda|0\nTalteüll|0\n' +
            'Tarerac|1\nTargasona|4\nTaurinyà|1\nTellet|0\nTerrats|0\nTesà|0\nTeulís|0\nToluges|0\nTorderes|0\n' +
            'Torrelles de la Salanca|0\nToès i Entrevalls|1\nTrasserra|0\nTrullars|0\nTuïr|0\nUr|4\nVallcebollera|4\n' +
            'Vallestàvia|1\nVallmanya|1\nVernet|1\nVilafranca de Conflent|1\nVilallonga de la Salanca|0\n' +
            'Vilallonga dels Monts|0\nVilamulaca|0\nVilanova de Raò|0\nVilanova de la Ribera|0\nVingrau|0\nVinçà|1\n' +
            'Vivers|0\nel Barcarès|0\nel Pertús|2\nel Soler|0\nel Tec|2\nel Voló|0\nels Angles|3\nels Banys i Palaldà|2\n' +
            'els Masos|1\nl\'Albera|2\nla Bastida|0\nla Cabanassa|4\nla Guingueta d\'Ix|4\nla Llaguna|3\nla Menera|2\n' +
            'la Roca d\'Albera|0\nla Tor de Querol|4\nla Torre d\'Elna|0\nles Cluses|2\nÈguet|4\nÒpol i Perellós|0',
        franja:
            'Areny de Noguera|0\nBenavarri|0\nBonansa|0\nCastigaleu|0\nEstopanyà|0\nIsàvena|0\nLasquarri|0\nles Paüls|0\n' +
            'Monesma i Queixigar|0\nMontanui|0\nel Pont de Montanyana|0\nSopeira|0\nTolba|0\nTor-la-ribera|0\nBeranui|0\n' +
            'Viacamp i Lliterà|0\nAlbelda|1\nBaells|1\nBinèfar|1\nel Campell|1\nCamporrells|1\nCastellonroi|1\nEsplucs|1\n' +
            'Peralta i Calassanç|1\nSant Esteve de Llitera|1\nSanui i Alins|1\nTamarit de Llitera|1\nel Torricó|1\n' +
            'Valldellou|1\nVensilló|1\nFraga|2\nMequinensa|2|Saragossa\nSaidí|2\nTorrent de Cinca|2\nVilella de Cinca|2\n' +
            'Arenys de Lledó|3\nBeseit|3\nCalaceit|3\nFondespatla|3\nFórnols de Matarranya|3\nla Freixneda|3\n' +
            'Lledó d\'Algars|3\nMassalió|3\nMont-roig de Tastavins|3\nPena-roja|3\nla Portellada|3\nRàfels|3\nQueretes|3\n' +
            'Torredarques|3\nla Torre del Comte|3\nla Vall de Tormo|3\nVall-de-roures|3\nValljunquera|3\nFaió|4\nFavara|4\n' +
            'Maella|4\nNonasp|4',
        bal:
            'Alaró|0\nAlcúdia|0\nAlgaida|0\nAndratx|0\nAriany|0\nArtà|0\nBanyalbufar|0\nBinissalem|0\nBúger|0\nBunyola|0\n' +
            'Calvià|0\nCampanet|0\nCampos|0\nCapdepera|0\nConsell|0\nCostitx|0\nDeià|0\nEscorca|0\nEsporles|0\n' +
            'Estellencs|0\nFelanitx|0\nFornalutx|0\nInca|0\nLloret de Vistalegre|0\nLloseta|0\nLlubí|0\nLlucmajor|0\n' +
            'Manacor|0\nMancor de la Vall|0\nMaria de la Salut|0\nMarratxí|0\nMontuïri|0\nMuro|0\nPalma|0\nPetra|0\n' +
            'sa Pobla|0\nPollença|0\nPorreres|0\nPuigpunyent|0\nses Salines|0\nSant Joan|0\nSant Llorenç des Cardassar|0\n' +
            'Santa Eugènia|0\nSanta Margalida|0\nSanta Maria del Camí|0\nSantanyí|0\nSelva|0\nSencelles|0\nSineu|0\n' +
            'Sóller|0\nSon Servera|0\nValldemossa|0\nVilafranca de Bonany|0\nAlaior|1\nCiutadella de Menorca|1\n' +
            'es Castell|1\nFerreries|1\nMaó|1\nes Mercadal|1\nes Migjorn Gran|1\nSant Lluís|1\nEivissa|2\n' +
            'Sant Antoni de Portmany|2\nSant Joan de Labritja|2\nSant Josep de sa Talaia|2\nSanta Eulària des Riu|2\n' +
            'Formentera|3'
    };
    // Illes Balears: les illes de cada grup (el nivell provincial de la lliga).
    const ISLAND_GROUPS = [
        { name: 'les Gimnèsies', islands: ['Mallorca', 'Menorca'] },
        { name: 'les Pitiüses', islands: ['Eivissa', 'Formentera'] }
    ];
    // Formentera és un sol municipi: els seus pobles, per a la lliga insular.
    const FORMENTERA_PLACES = ['Sant Francesc Xavier', 'Sant Ferran de ses Roques', 'el Pilar de la Mola', 'la Savina',
        'es Pujols', 'es Caló'];
    // Andorra: les set parròquies i els seus pobles (no té comarques ni
    // províncies; els rivals hi són de tot el país).
    const ANDORRA_PLACES = ['Canillo', 'Soldeu', 'el Tarter', 'Ransol', 'Meritxell', 'Prats', 'Encamp',
        'el Pas de la Casa', 'Vila', 'les Bons', 'Ordino', 'la Cortinada', 'Llorts', 'Ansalonga', 'el Serrat',
        'la Massana', 'Arinsal', 'Erts', 'Sispony', 'Anyós', 'Pal', 'Andorra la Vella', 'Santa Coloma',
        'la Margineda', 'Escaldes-Engordany', 'Engordany', 'Sant Julià de Lòria', 'Aixovall', 'Bixessarri',
        'Fontaneda', 'Auvinyà', 'Nagol'];
    // L'Alguer (un sol municipi, sense comarca): la Nurra, la regió històrica
    // on hi ha l'Alguer; la província de Sàsser; i Sardenya.
    const ALGUER_PLACES = {
        nurra: ['Sàsser', 'Porto Torres', 'Stintino', 'Fertilia', 'Santa Maria la Palma', 'Maristella',
            'Argentiera', 'Palmadula', 'Campanedda', 'La Corte', 'Pozzo San Nicola', 'Tottubella'],
        sasser: ['Sàsser', 'Porto Torres', 'Sorso', 'Sennori', 'Ossi', 'Tissi', 'Usini', 'Ittiri', 'Olmedo', 'Uri',
            'Putifigari', 'Villanova Monteleone', 'Thiesi', 'Bonorva', 'Pozzomaggiore', 'Ozieri', 'Ploaghe', 'Osilo',
            'Castelsardo', 'Valledoria', 'Perfugas', 'Stintino', 'Codrongianos', 'Muros', 'Florinas'],
        sardenya: ['Càller', 'Sàsser', 'Nuoro', 'Oristany', 'Olbia', "Quartu Sant'Elena", 'Carbonia', 'Iglesias',
            'Tempio Pausania', 'Selargius', 'Porto Torres', 'Macomer', 'Tortolì', 'Lanusei', 'Ozieri', 'Sanluri',
            'Villacidro', 'Siniscola', 'Assemini', 'Capoterra']
    };
    // Municipis que es poden triar d'una llista fora de Catalunya, a més dels
    // de dalt (la resta s'escriuen).
    const OTHER_MUNICIPIS = {
        and: ['Canillo', 'Encamp', 'Ordino', 'la Massana', 'Andorra la Vella', 'Sant Julià de Lòria', 'Escaldes-Engordany']
            .map(n => [n, 'Andorra']),
        alguer: [["l'Alguer", "l'Alguer"]]
    };

    // Rivals dels nivells de dalt: ciutats dels Països Catalans (amb el
    // territori, que tria els noms dels rivals: nomslliga.js), països
    // d'Europa i països del món.
    const PPCC_CITIES_BY_TERRITORY = {
        cat: ['Barcelona', 'Girona', 'Lleida', 'Tarragona', 'Reus', 'Manresa', 'Vic', 'Sabadell', 'Terrassa', 'Mataró',
            'Tortosa', 'Figueres', 'Olot', 'Igualada', "la Seu d'Urgell", 'Granollers'],
        val: ['València', 'Alacant', 'Castelló de la Plana', 'Elx', 'Gandia', 'Alcoi', 'Xàtiva', 'Vila-real', 'Sagunt', 'Ontinyent', 'Dénia'],
        bal: ['Palma', 'Maó', 'Ciutadella', 'Eivissa', 'Manacor', 'Inca', 'Sóller'],
        and: ['Andorra la Vella', 'Escaldes-Engordany'],
        nord: ['Perpinyà', 'Prada', 'Ceret'],
        franja: ['Fraga', 'Tamarit de Llitera', 'Vall-de-roures'],
        alguer: ["l'Alguer"]
    };
    const PPCC_CITIES = [];
    const PPCC_CITY_TERRITORY = {};
    Object.keys(PPCC_CITIES_BY_TERRITORY).forEach(function (t) {
        PPCC_CITIES_BY_TERRITORY[t].forEach(function (c) { PPCC_CITIES.push(c); PPCC_CITY_TERRITORY[c] = t; });
    });
    const EUROPE = [
        'França', 'Itàlia', 'Alemanya', 'Països Baixos', 'Noruega', 'Polònia', 'Ucraïna', 'Hongria', 'Portugal',
        'Grècia', 'Suècia', 'Àustria', 'Irlanda', 'Txèquia', 'Romania', 'Croàcia', 'Dinamarca', 'Bèlgica', 'Suïssa',
        'Finlàndia', 'Eslovènia', 'Lituània', 'Estònia', 'Islàndia', 'Sèrbia', 'Geòrgia', 'Armènia', 'Bulgària',
        'Eslovàquia', 'Letònia'
    ];
    const WORLD = [
        'Índia', 'Xina', 'Estats Units', 'Brasil', 'Argentina', 'Japó', 'Mèxic', 'Perú', 'Egipte', 'Iran',
        'Uzbekistan', 'Kazakhstan', 'Austràlia', 'Canadà', 'Sud-àfrica', 'Filipines', 'Vietnam', 'Indonèsia', 'Cuba',
        'Colòmbia', 'Mongòlia', 'Nigèria', 'Marroc', 'Xile', 'Turquia', 'Corea del Sud', 'Nova Zelanda', 'Uruguai',
        'Noruega', 'França', 'Països Baixos', 'Ucraïna', 'Alemanya', 'Geòrgia', 'Armènia'
    ];

    // Comparació sense accents ni majúscules ni l'apòstrof tipogràfic.
    function fold(s) {
        return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[’`´]/g, "'").replace(/·/g, '.').replace(/\s+/g, ' ').trim().toLowerCase();
    }
    // Sense l'article del davant, per ordenar i buscar («el Masnou» → «Masnou»).
    function bare(s) {
        return String(s == null ? '' : s).replace(/^(el|la|els|les|es)\s+/i, '').replace(/^l['’]/i, '');
    }

    let catCache = null;
    function catalanMunicipalities() {
        if (catCache) return catCache;
        catCache = CAT_MUNICIPIS.split('\n').map(function (line) {
            const p = line.split('|');
            return { name: p[0], comarca: CAT_COMARQUES[p[1]] || '', province: CAT_PROVINCES[p[2]] || '', territory: 'cat' };
        });
        return catCache;
    }

    function territory(id) {
        return TERRITORIES.find(function (t) { return t.id === id; }) || null;
    }

    // Comarques d'un territori: [{ name, province }].
    function comarques(territoryId) {
        if (territoryId === 'cat') {
            const seen = {};
            const out = [];
            catalanMunicipalities().forEach(function (m) {
                const key = m.comarca + '|' + m.province;
                if (seen[key]) return;
                seen[key] = true;
                out.push({ name: m.comarca, province: m.province });
            });
            return out.sort(function (a, b) { return fold(bare(a.name)).localeCompare(fold(bare(b.name))); });
        }
        return (OTHER_COMARQUES[territoryId] || []).map(function (c) { return { name: c[0], province: c[1] }; });
    }
    function provinces(territoryId) {
        const out = [];
        comarques(territoryId).forEach(function (c) { if (out.indexOf(c.province) < 0) out.push(c.province); });
        return out;
    }
    // Província d'una comarca (la primera, si en té més d'una com la Cerdanya).
    function provinceOfComarca(territoryId, comarca) {
        const key = fold(bare(comarca));
        const hit = comarques(territoryId).find(function (c) { return fold(bare(c.name)) === key; });
        return hit ? hit.province : '';
    }

    // Municipis que es poden triar: tots els de Catalunya i, als altres
    // territoris, els que hi ha a les llistes.
    const otherCache = {};
    function municipalities(territoryId) {
        if (territoryId === 'cat') return catalanMunicipalities();
        if (otherCache[territoryId]) return otherCache[territoryId];
        const coms = OTHER_COMARQUES[territoryId] || [];
        const byComarca = (OTHER_MUNICIPIS_BY_COMARCA[territoryId] || '').split('\n').filter(Boolean).map(function (line) {
            const p = line.split('|');
            const c = coms[Number(p[1])] || ['', ''];
            return { name: p[0], comarca: c[0], province: p[2] || c[1], territory: territoryId };
        });
        const listed = (OTHER_MUNICIPIS[territoryId] || []).map(function (m) {
            return { name: m[0], comarca: m[1], province: provinceOfComarca(territoryId, m[1]), territory: territoryId };
        });
        otherCache[territoryId] = byComarca.concat(listed);
        return otherCache[territoryId];
    }
    // Grup d'illes (Gimnèsies o Pitiüses) d'una illa de les Balears, o null.
    function islandGroup(island) {
        const key = fold(island);
        return ISLAND_GROUPS.find(function (g) { return g.islands.some(function (i) { return fold(i) === key; }); }) || null;
    }

    // Cerca per a la finestra: primer els que comencen pel text (amb article o
    // sense), després els que el contenen. Sense territori, a Catalunya.
    function searchMunicipalities(query, options) {
        const opts = options || {};
        const q = fold(query);
        if (q.length < (opts.minLength || 2)) return [];
        const limit = opts.limit || 8;
        const list = municipalities(opts.territory || 'cat');
        const starts = [], contains = [];
        list.forEach(function (m) {
            const full = fold(m.name), b = fold(bare(m.name));
            if (full.indexOf(q) === 0 || b.indexOf(q) === 0) starts.push(m);
            else if (full.indexOf(q) > 0) contains.push(m);
        });
        const byName = function (a, b) { return fold(bare(a.name)).localeCompare(fold(bare(b.name))); };
        return starts.sort(byName).concat(contains.sort(byName)).slice(0, limit);
    }
    function findMunicipality(name, territoryId) {
        const q = fold(name);
        if (!q) return null;
        const list = municipalities(territoryId || 'cat');
        return list.find(function (m) { return fold(m.name) === q; })
            || list.find(function (m) { return fold(bare(m.name)) === fold(bare(name)); }) || null;
    }

    // Localitat del jugador neta: { territory, municipi, comarca, provincia,
    // pais }. Si el municipi és a la llista del territori, la comarca i la
    // província en surten (i mana la llista). null si no hi ha municipi.
    function normalizeHome(input) {
        const i = input || {};
        const clean = function (s, max) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max || 60); };
        const t = territory(i.territory) ? i.territory : 'cat';
        let municipi = clean(i.municipi), comarca = clean(i.comarca), provincia = clean(i.provincia);
        const pais = t === 'fora' ? clean(i.pais) : '';
        if (!municipi) return null;
        const hit = findMunicipality(municipi, t);
        if (hit) {
            // Si el municipi és a la llista, en mana la comarca i la província
            // (també fora de Catalunya: una comarca desada que ja no existeix,
            // com l'Horta Oest, es corregeix).
            municipi = hit.name;
            comarca = hit.comarca;
            provincia = hit.province;
        }
        if (comarca && !provincia) provincia = provinceOfComarca(t, comarca);
        return { territory: t, municipi: municipi, comarca: comarca, provincia: provincia, pais: pais };
    }

    function pickDistinct(list, count, random, exclude) {
        const rnd = typeof random === 'function' ? random : Math.random;
        const ex = (exclude || []).map(fold);
        const pool = list.filter(function (x) { return x && ex.indexOf(fold(x)) < 0; });
        const out = [];
        while (out.length < count && pool.length) {
            const j = Math.floor(rnd() * pool.length);
            out.push(pool.splice(j, 1)[0]);
        }
        // Si n'hi ha menys que rivals (comarques petites), es repeteixen.
        let k = 0;
        while (out.length < count && out.length > 0) out.push(out[k++ % out.length]);
        return out;
    }

    // D'on és cada rival segons el nivell (0 municipal ... 6 mundial), amb
    // l'àrea de cada lliga (core.js: leagueLevelName):
    // - municipal: en blanc (tots són del poble);
    // - comarcal: municipis de la comarca (a les Balears, de l'illa; a Andorra,
    //   parròquies i pobles; a l'Alguer, llocs de la Nurra);
    // - provincial: comarques de la província (Catalunya i País Valencià);
    //   municipis del grup d'illes (Gimnèsies o Pitiüses), de la Catalunya Nord
    //   o de la Franja dins la província; Andorra; la província de Sàsser;
    // - territori: municipis de Catalunya (a la Catalunya Nord, també els seus:
    //   hi juga la Lliga Catalana), comarques del País Valencià, municipis de
    //   les Balears o de la Franja, Andorra, ciutats de Sardenya;
    // - Països Catalans, ciutats; Europa i món, països.
    // Retorna count textos (buits si no se'n sap res).
    function rivalOrigins(level, home, count, random) {
        const h = home || {};
        const n = Number.isFinite(count) ? count : 9;
        const blank = function () { const a = []; for (let i = 0; i < n; i++) a.push(''); return a; };
        const t = h.territory || 'cat';
        const pick = function (list) {
            const picked = pickDistinct(list, n, random, [h.municipi]);
            return picked.length ? picked : blank();
        };
        const names = function (list) { return list.map(function (m) { return m.name; }); };
        const inComarca = function (m) { return h.comarca && fold(bare(m.comarca)) === fold(bare(h.comarca)); };
        if (level === 0 || (t === 'fora' && level < 4)) return blank();
        if (level === 1) {
            if (t === 'and') return pick(ANDORRA_PLACES);
            if (t === 'alguer') return pick(ALGUER_PLACES.nurra);
            if (t === 'bal' && fold(h.comarca) === 'formentera') return pick(FORMENTERA_PLACES);
            let own = names(municipalities(t).filter(inComarca));
            // Una comarca desada que ja no hi és (l'Horta Oest): la del municipi.
            const hit = own.length ? null : findMunicipality(h.municipi, t);
            if (hit && hit.comarca) own = names(municipalities(t).filter(function (m) { return m.comarca === hit.comarca; }));
            // Una comarca sense municipis a la llista (la Fenolleda): del territori.
            return pick(own.length || t === 'cat' || !h.comarca ? own : names(municipalities(t)));
        }
        if (level === 2) {
            if (t === 'and') return pick(ANDORRA_PLACES);
            if (t === 'alguer') return pick(ALGUER_PLACES.sasser);
            if (t === 'bal') {
                const g = islandGroup(h.comarca);
                return g ? pick(names(municipalities(t).filter(function (m) {
                    return g.islands.some(function (i) { return fold(i) === fold(m.comarca); });
                }))) : blank();
            }
            if (t === 'nord') return pick(names(municipalities(t)));
            if (t === 'franja') {
                return pick(names(municipalities(t).filter(function (m) { return fold(m.province) === fold(h.provincia); })));
            }
            const list = comarques(t).filter(function (c) { return fold(c.province) === fold(h.provincia); })
                .map(function (c) { return c.name; });
            const picked = pickDistinct(list, n, random, [h.comarca]);
            return picked.length ? picked : blank();
        }
        if (level === 3) {
            if (t === 'and') return pick(ANDORRA_PLACES);
            if (t === 'alguer') return pick(ALGUER_PLACES.sardenya);
            if (t === 'cat') return pick(names(catalanMunicipalities()));
            if (t === 'nord') return pick(names(catalanMunicipalities()).concat(names(municipalities('nord'))));
            if (t === 'bal' || t === 'franja') return pick(names(municipalities(t)));
            return pick(comarques(t).map(function (c) { return c.name; }));
        }
        if (level === 4) return pickDistinct(PPCC_CITIES, n, random, [h.municipi]);
        if (level === 5) return pickDistinct(EUROPE, n, random);
        return pickDistinct(WORLD, n, random);
    }

    // Territori d'on és un rival: el d'una ciutat de la Lliga dels Països
    // Catalans o, si no n'és cap, el d'un municipi de la Catalunya Nord o de
    // Catalunya (per als noms dels rivals de la Lliga Catalana de qui juga a
    // la Catalunya Nord). null si no se sap.
    function originTerritory(place) {
        if (PPCC_CITY_TERRITORY[place]) return PPCC_CITY_TERRITORY[place];
        if (!place) return null;
        if (findMunicipality(place, 'nord')) return 'nord';
        if (findMunicipality(place, 'cat')) return 'cat';
        return null;
    }

    return {
        TERRITORIES: TERRITORIES,
        CAT_COMARQUES: CAT_COMARQUES,
        CAT_PROVINCES: CAT_PROVINCES,
        PPCC_CITIES: PPCC_CITIES,
        EUROPE: EUROPE,
        WORLD: WORLD,
        fold: fold,
        bare: bare,
        territory: territory,
        catalanMunicipalities: catalanMunicipalities,
        municipalities: municipalities,
        comarques: comarques,
        provinces: provinces,
        provinceOfComarca: provinceOfComarca,
        searchMunicipalities: searchMunicipalities,
        findMunicipality: findMunicipality,
        normalizeHome: normalizeHome,
        rivalOrigins: rivalOrigins,
        islandGroup: islandGroup,
        // Territori d'una ciutat de la Lliga dels Països Catalans (o null).
        ppccCityTerritory: function (city) { return PPCC_CITY_TERRITORY[city] || null; },
        originTerritory: originTerritory
    };
});
