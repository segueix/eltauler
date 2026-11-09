/* Noms dels rivals de la lliga (LLIGA.md §6).
 *
 * Cada temporada té rivals nous, amb noms de persona que s'escauen a la lliga
 * que es juga i que es fan més internacionals a mesura que el jugador puja:
 *
 * - municipal, comarcal, provincial i territori: noms del territori del
 *   jugador (catalans, valencians, mallorquins i menorquins, rossellonesos,
 *   andorrans, de la Franja o de l'Alguer), cada nivell amb més noms de la
 *   gent que hi viu d'altres orígens (del 0% al municipal al 40% al
 *   territori);
 * - Països Catalans: el nom va amb la ciutat d'origen del rival (un de Palma,
 *   mallorquí; un de Perpinyà, rossellonès...);
 * - Europa i món: el nom és del país d'origen del rival (una de Polònia,
 *   Zofia Kowalska; un del Japó, Haruto Tanaka).
 *
 * Els noms es fan combinant noms i cognoms comuns de cada lloc. S'han tret
 * els cognoms dels grans jugadors d'escacs i les combinacions de persones
 * conegudes que podien sortir. app.js recorda els noms de les darreres
 * temporades perquè no es repeteixin.
 *
 * Tot és pur (sense DOM); l'atzar es pot injectar per a les proves.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.ElTaulerNomsLliga = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function () {
    'use strict';

    // Cultures: f i m (noms de dona i d'home), s (cognoms) o sf i sm (cognoms
    // de dona i d'home, on canvien), mf i mm (segon nom vietnamita) i order
    // 'family' on el cognom va davant.
    const CULTURES = {
        // ── Territoris dels Països Catalans ──
        cat: {
            f: ['Núria', 'Montse', 'Laia', 'Marta', 'Anna', 'Mireia', 'Txell', 'Roser', 'Glòria', 'Carla', 'Júlia', 'Clara',
                'Berta', 'Aina', 'Queralt', 'Neus', 'Ona', 'Mercè', 'Elisenda', 'Judit'],
            m: ['Jordi', 'Pere', 'Quim', 'Pep', 'Marc', 'Oriol', 'Arnau', 'Pol', 'Jaume', 'Xavier', 'Joan', 'Ferran',
                'Albert', 'Biel', 'Guillem', 'Roger', 'Toni', 'Eudald', 'Martí', 'Lluís'],
            s: ['Puig', 'Vila', 'Serra', 'Soler', 'Ferrer', 'Font', 'Roca', 'Bosch', 'Casas', 'Sala', 'Mas', 'Riera',
                'Valls', 'Coll', 'Prat', 'Camps', 'Vidal', 'Roig', 'Costa', 'Grau', 'Planas', 'Pons', 'Rius', 'Badia',
                'Bonet', 'Llorens', 'Rovira', 'Comas', 'Batlle', 'Carbonell', 'Cortada', 'Sabaté', 'Guix', 'Masdeu',
                'Vilaró', 'Bertran', 'Canals', 'Galí', 'Oliveras', 'Rierola']
        },
        val: {
            f: ['Amparo', 'Pepa', 'Vicenta', 'Empar', 'Rosa', 'Neus', 'Llum', 'Carme', 'Lourdes', 'Inma', 'Xelo', 'Maria'],
            m: ['Vicent', 'Ximo', 'Pepe', 'Toni', 'Xavi', 'Batiste', 'Joanjo', 'Quique', 'Rafa', 'Pau', 'Nelo', 'Paco'],
            s: ['Ferrer', 'Peris', 'Climent', 'Llopis', 'Gisbert', 'Martí', 'Bataller', 'Soriano', 'Escrivà', 'Sanchis',
                'Alemany', 'Monzó', 'Ballester', 'Mompó', 'Tormo', 'Boix', 'Cervera', 'Calatayud', 'Sendra', 'Gil']
        },
        bal: {
            f: ['Aina', 'Joana', 'Margalida', 'Catalina', 'Francina', 'Antònia', 'Maria', 'Bel', 'Xisca', 'Apol·lònia'],
            m: ['Biel', 'Tomeu', 'Xisco', 'Toni', 'Pep', 'Miquel', 'Jaume', 'Llorenç', 'Guillem', 'Joan'],
            s: ['Bauzà', 'Oliver', 'Pons', 'Florit', 'Moll', 'Sastre', 'Mascaró', 'Vich', 'Riera', 'Bestard',
                'Alzamora', 'Ramis', 'Coll', 'Mir', 'Fiol', 'Gelabert', 'Amengual', 'Febrer', 'Seguí', 'Vives']
        },
        nord: {
            f: ['Céline', 'Nathalie', 'Mireille', 'Montserrat', 'Anne', 'Marie', 'Laure', 'Sandrine', 'Núria'],
            m: ['Jordi', 'Pere', 'Laurent', 'Mathieu', 'Joan', 'Sébastien', 'Thierry', 'Julien', 'Miquel'],
            s: ['Garrigue', 'Escudier', 'Sarda', 'Bosch', 'Vidal', 'Font', 'Pagès', 'Py', 'Roig', 'Batlle', 'Casals',
                'Delonca', 'Bassole', 'Gual', 'Parès', 'Cases']
        },
        and: {
            f: ['Meritxell', 'Sílvia', 'Laia', 'Eva', 'Núria', 'Judit', 'Ariadna', 'Rita'],
            m: ['Joan', 'Marc', 'Jordi', 'Albert', 'Gerard', 'Xavier', 'Pere', 'Esteve'],
            s: ['Cerqueda', 'Font', 'Rossell', 'Marticella', 'Bonell', 'Pla', 'Areny', 'Moles', 'Gelabert', 'Duró',
                'Ribas', 'Babot', 'Naudi', 'Riba']
        },
        franja: {
            f: ['Pilar', 'Carmen', 'Rosa', 'Teresa', 'Núria', 'Montse', 'Ana', 'Mercè'],
            m: ['Josep', 'Ramon', 'Joaquim', 'Manel', 'Jesús', 'Àngel', 'Xavier', 'Hèctor'],
            s: ['Lacasa', 'Salvador', 'Pallarés', 'Arnau', 'Sancho', 'Bielsa', 'Castell', 'Monclús', 'Gràcia',
                'Llovet', 'Blasco', 'Ballarín', 'Moliné', 'Abella']
        },
        alguer: {
            f: ['Maria', 'Antonella', 'Giovanna', 'Caterina', 'Rita', 'Paola', 'Margalida'],
            m: ['Antoni', 'Joan', 'Gavino', 'Francesc', 'Salvatore', 'Pietro', 'Miquel'],
            s: ['Sechi', 'Piras', 'Mura', 'Carta', 'Pinna', 'Delogu', 'Scanu', 'Manca', 'Pais', 'Fois', 'Serra', 'Bardino']
        },
        // ── Gent d'altres orígens que viu als territoris ──
        es: {
            f: ['Laura', 'Lucía', 'Cristina', 'Sara', 'Raquel', 'Elena', 'Paula', 'Silvia', 'Beatriz', 'Irene'],
            m: ['Sergio', 'Javier', 'Alejandro', 'David', 'Álvaro', 'Rubén', 'Iván', 'Pablo', 'Daniel', 'Adrián'],
            s: ['García', 'Martínez', 'López', 'Sánchez', 'Pérez', 'Fernández', 'Rodríguez', 'Gómez', 'Ruiz', 'Moreno',
                'Jiménez', 'Navarro', 'Romero', 'Ortega', 'Delgado', 'Molina', 'Castro', 'Serrano']
        },
        latam: {
            f: ['Valentina', 'Camila', 'Daniela', 'Gabriela', 'Mariana', 'Ximena'],
            m: ['Mateo', 'Santiago', 'Sebastián', 'Diego', 'Andrés', 'Joaquín'],
            s: ['Rojas', 'Quispe', 'Vargas', 'Herrera', 'Castillo', 'Mendoza', 'Morales', 'Paredes', 'Salazar', 'Guzmán',
                'Cárdenas', 'Benítez']
        },
        ma: {
            f: ['Fatima', 'Salma', 'Nadia', 'Yasmina', 'Imane', 'Khadija'],
            m: ['Youssef', 'Yassine', 'Hamza', 'Karim', 'Mehdi', 'Omar'],
            s: ['El Amrani', 'Benali', 'Bennani', 'El Idrissi', 'Tazi', 'Alaoui', 'Chakir', 'Ouali', 'Mansouri', 'Haddad']
        },
        ro: {
            f: ['Ioana', 'Andreea', 'Elena', 'Maria', 'Bianca', 'Alina'],
            m: ['Andrei', 'Mihai', 'Ionuț', 'Alexandru', 'Bogdan', 'Radu'],
            s: ['Popescu', 'Ionescu', 'Stan', 'Dumitru', 'Constantin', 'Marin', 'Stoica', 'Munteanu']
        },
        cn: {
            order: 'family',
            f: ['Mei', 'Xiu', 'Lan', 'Jing', 'Ying', 'Hui'],
            m: ['Wei', 'Jun', 'Tao', 'Lei', 'Bo', 'Ming'],
            s: ['Zhang', 'Wang', 'Li', 'Liu', 'Chen', 'Yang', 'Huang', 'Zhao', 'Zhou', 'Wu']
        },
        pk: {
            f: ['Ayesha', 'Fatima', 'Sana', 'Zainab', 'Hira', 'Mahnoor'],
            m: ['Ali', 'Usman', 'Bilal', 'Hassan', 'Faisal', 'Hamid'],
            s: ['Raza', 'Iqbal', 'Malik', 'Hussain', 'Qureshi', 'Siddiqui', 'Butt', 'Chaudhry']
        },
        pt: {
            f: ['Inês', 'Beatriz', 'Mariana', 'Leonor', 'Catarina', 'Rita'],
            m: ['João', 'Tiago', 'Rui', 'Duarte', 'Gonçalo', 'Nuno'],
            s: ['Silva', 'Pereira', 'Ferreira', 'Santos', 'Oliveira', 'Rodrigues', 'Costa', 'Martins', 'Sousa', 'Lopes']
        },
        fr: {
            f: ['Camille', 'Léa', 'Chloé', 'Manon', 'Julie', 'Claire'],
            m: ['Thomas', 'Hugo', 'Louis', 'Antoine', 'Julien', 'Maxime'],
            s: ['Martin', 'Bernard', 'Dubois', 'Moreau', 'Laurent', 'Lefebvre', 'Roux', 'Fournier', 'Girard', 'Bonnet',
                'Mercier', 'Lambert']
        },
        it: {
            f: ['Giulia', 'Chiara', 'Francesca', 'Sara', 'Elena', 'Martina'],
            m: ['Luca', 'Marco', 'Matteo', 'Andrea', 'Davide', 'Lorenzo'],
            s: ['Rossi', 'Ferri', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo', 'Conti', 'Costa', 'Fontana', 'Moretti', 'Barbieri']
        },
        de: {
            f: ['Lena', 'Hannah', 'Anna', 'Laura', 'Katrin', 'Julia'],
            m: ['Jonas', 'Lukas', 'Felix', 'Tobias', 'Niklas', 'Jan'],
            s: ['Weber', 'Schmidt', 'Müller', 'Wagner', 'Becker', 'Hoffmann', 'Schulz', 'Koch', 'Richter', 'Wolf']
        },
        // ── Europa ──
        nl: {
            f: ['Sanne', 'Lotte', 'Femke', 'Anouk', 'Eva', 'Iris'],
            m: ['Daan', 'Bram', 'Sem', 'Thijs', 'Ruben', 'Jeroen'],
            s: ['de Jong', 'Jansen', 'de Vries', 'Bakker', 'Visser', 'Smit', 'Meijer', 'de Boer', 'Mulder', 'Bos']
        },
        no: {
            f: ['Ingrid', 'Sigrid', 'Ingvild', 'Kari', 'Hanne', 'Silje'],
            m: ['Lars', 'Henrik', 'Erik', 'Sindre', 'Eirik', 'Håkon'],
            s: ['Hansen', 'Johansen', 'Olsen', 'Larsen', 'Andersen', 'Haugen', 'Berg', 'Dahl', 'Strand', 'Lie']
        },
        pl: {
            f: ['Agnieszka', 'Zofia', 'Katarzyna', 'Magdalena', 'Aleksandra', 'Natalia'],
            m: ['Kacper', 'Jakub', 'Piotr', 'Tomasz', 'Michał', 'Paweł'],
            sf: ['Nowak', 'Kowalska', 'Wiśniewska', 'Wójcik', 'Kamińska', 'Zielińska'],
            sm: ['Nowak', 'Kowalski', 'Wiśniewski', 'Wójcik', 'Kamiński', 'Zieliński']
        },
        ua: {
            f: ['Olena', 'Iryna', 'Oksana', 'Kateryna', 'Anastasiia', 'Yuliia'],
            m: ['Oleksandr', 'Andrii', 'Dmytro', 'Serhii', 'Taras', 'Mykola'],
            s: ['Bondarenko', 'Kovalenko', 'Tkachenko', 'Kravchenko', 'Melnyk', 'Boyko', 'Lysenko', 'Moroz', 'Savchenko']
        },
        hu: {
            f: ['Eszter', 'Anna', 'Réka', 'Zsófia', 'Dóra', 'Nóra'],
            m: ['Bence', 'Máté', 'Dániel', 'Gergő', 'Ádám', 'Levente'],
            s: ['Nagy', 'Kovács', 'Tóth', 'Szabó', 'Horváth', 'Varga', 'Kiss', 'Molnár', 'Németh', 'Farkas']
        },
        gr: {
            f: ['Eleni', 'Maria', 'Katerina', 'Sofia', 'Dimitra', 'Georgia'],
            m: ['Giorgos', 'Nikos', 'Dimitris', 'Kostas', 'Yannis', 'Panagiotis'],
            sf: ['Papadopoulou', 'Georgiou', 'Nikolaou', 'Ioannou', 'Vlachou', 'Karagianni'],
            sm: ['Papadopoulos', 'Georgiou', 'Nikolaou', 'Ioannou', 'Vlachos', 'Karagiannis']
        },
        se: {
            f: ['Elin', 'Maja', 'Frida', 'Linnea', 'Ebba', 'Klara'],
            m: ['Oskar', 'Viktor', 'Axel', 'Emil', 'Gustav', 'Linus'],
            s: ['Andersson', 'Johansson', 'Karlsson', 'Nilsson', 'Eriksson', 'Larsson', 'Lindqvist', 'Berg']
        },
        at: {
            f: ['Johanna', 'Theresa', 'Magdalena', 'Lisa', 'Katharina', 'Verena'],
            m: ['Florian', 'Lukas', 'Matthias', 'Stefan', 'Maximilian', 'Dominik'],
            s: ['Gruber', 'Huber', 'Bauer', 'Wagner', 'Pichler', 'Steiner', 'Moser', 'Mayer', 'Hofer', 'Leitner']
        },
        ie: {
            f: ['Aoife', 'Niamh', 'Siobhán', 'Ciara', 'Orla', 'Róisín'],
            m: ['Conor', 'Seán', 'Cian', 'Darragh', 'Oisín', 'Eoin'],
            s: ['Murphy', 'Kelly', "O'Sullivan", 'Walsh', 'Byrne', 'Ryan', "O'Brien", 'Doyle', 'Kavanagh', 'Quinn']
        },
        cz: {
            f: ['Tereza', 'Kateřina', 'Lucie', 'Eliška', 'Barbora', 'Veronika'],
            m: ['Jakub', 'Tomáš', 'Ondřej', 'Lukáš', 'Vojtěch', 'Petr'],
            sf: ['Nováková', 'Svobodová', 'Dvořáková', 'Černá', 'Procházková', 'Kučerová'],
            sm: ['Novák', 'Svoboda', 'Dvořák', 'Černý', 'Procházka', 'Kučera']
        },
        hr: {
            f: ['Ana', 'Ivana', 'Petra', 'Marija', 'Lucija', 'Maja'],
            m: ['Ivan', 'Luka', 'Marko', 'Josip', 'Matej', 'Ante'],
            s: ['Horvat', 'Kovačević', 'Babić', 'Marić', 'Jurić', 'Novak', 'Knežević', 'Vuković']
        },
        dk: {
            f: ['Freja', 'Ida', 'Mette', 'Sofie', 'Line', 'Camilla'],
            m: ['Mads', 'Rasmus', 'Frederik', 'Jonas', 'Anders', 'Kasper'],
            s: ['Jensen', 'Nielsen', 'Hansen', 'Pedersen', 'Andersen', 'Christensen', 'Larsen', 'Sørensen', 'Rasmussen']
        },
        be: {
            f: ['Lotte', 'Marie', 'Elise', 'Charlotte', 'Nina', 'Julie'],
            m: ['Wout', 'Arne', 'Lucas', 'Louis', 'Pieter', 'Bram'],
            s: ['Peeters', 'Janssens', 'Maes', 'Jacobs', 'Willems', 'Claes', 'Dubois', 'Lambert', 'Wouters']
        },
        ch: {
            f: ['Lea', 'Nina', 'Anja', 'Selina', 'Céline', 'Giulia'],
            m: ['Luca', 'Noah', 'Jonas', 'Reto', 'Urs', 'Fabian'],
            s: ['Müller', 'Meier', 'Schmid', 'Keller', 'Weber', 'Huber', 'Brunner', 'Baumann', 'Frei', 'Zimmermann']
        },
        fi: {
            f: ['Aino', 'Emilia', 'Helmi', 'Sanna', 'Noora', 'Venla'],
            m: ['Eetu', 'Juho', 'Mikko', 'Antti', 'Ville', 'Joonas'],
            s: ['Korhonen', 'Virtanen', 'Mäkinen', 'Nieminen', 'Hämäläinen', 'Laine', 'Heikkinen', 'Koskinen']
        },
        si: {
            f: ['Nina', 'Maja', 'Eva', 'Špela', 'Urška', 'Tina'],
            m: ['Luka', 'Žan', 'Nejc', 'Jan', 'Matic', 'Rok'],
            s: ['Novak', 'Horvat', 'Kranjc', 'Zupančič', 'Kovač', 'Potočnik', 'Mlakar', 'Vidmar']
        },
        lt: {
            f: ['Gabija', 'Ieva', 'Austėja', 'Rūta', 'Eglė', 'Greta'],
            m: ['Lukas', 'Matas', 'Jonas', 'Mantas', 'Tomas', 'Domantas'],
            sf: ['Kazlauskaitė', 'Petrauskienė', 'Jankauskaitė', 'Stankevičiūtė', 'Vasiliauskienė', 'Žukauskaitė'],
            sm: ['Kazlauskas', 'Petrauskas', 'Jankauskas', 'Stankevičius', 'Vasiliauskas', 'Žukauskas']
        },
        ee: {
            f: ['Kertu', 'Liis', 'Triin', 'Maarja', 'Kadri', 'Mari'],
            m: ['Rasmus', 'Markus', 'Karl', 'Siim', 'Martin', 'Kristjan'],
            s: ['Tamm', 'Saar', 'Sepp', 'Mägi', 'Kask', 'Kukk', 'Rebane', 'Põld']
        },
        is: {
            f: ['Guðrún', 'Sigríður', 'Helga', 'Katrín', 'Anna', 'Hildur'],
            m: ['Jón', 'Gunnar', 'Einar', 'Ólafur', 'Sigurður', 'Kári'],
            sf: ['Jónsdóttir', 'Sigurðardóttir', 'Gunnarsdóttir', 'Ólafsdóttir', 'Einarsdóttir'],
            sm: ['Jónsson', 'Sigurðsson', 'Gunnarsson', 'Ólafsson', 'Einarsson']
        },
        rs: {
            f: ['Jelena', 'Milica', 'Ana', 'Teodora', 'Marija', 'Jovana'],
            m: ['Nikola', 'Stefan', 'Marko', 'Lazar', 'Miloš', 'Uroš'],
            s: ['Jovanović', 'Petrović', 'Nikolić', 'Marković', 'Đorđević', 'Stojanović', 'Ilić', 'Pavlović']
        },
        ge: {
            f: ['Nino', 'Mariam', 'Tamar', 'Ana', 'Salome', 'Elene'],
            m: ['Giorgi', 'Luka', 'Davit', 'Levan', 'Irakli', 'Nika'],
            s: ['Beridze', 'Kapanadze', 'Gelashvili', 'Maisuradze', 'Lomidze', 'Tsiklauri', 'Abashidze']
        },
        am: {
            f: ['Anahit', 'Lilit', 'Mariam', 'Ani', 'Gayane', 'Nare'],
            m: ['Aram', 'Davit', 'Hayk', 'Narek', 'Gor', 'Armen'],
            s: ['Hakobyan', 'Harutyunyan', 'Grigoryan', 'Khachatryan', 'Hovhannisyan', 'Vardanyan', 'Gevorgyan', 'Avetisyan']
        },
        bg: {
            f: ['Maria', 'Ivana', 'Elena', 'Desislava', 'Gergana', 'Viktoria'],
            m: ['Georgi', 'Ivan', 'Dimitar', 'Nikolay', 'Kaloyan', 'Martin'],
            sf: ['Ivanova', 'Georgieva', 'Dimitrova', 'Petrova', 'Nikolova', 'Stoyanova'],
            sm: ['Ivanov', 'Georgiev', 'Dimitrov', 'Petrov', 'Nikolov', 'Stoyanov']
        },
        sk: {
            f: ['Zuzana', 'Lucia', 'Simona', 'Natália', 'Michaela', 'Petra'],
            m: ['Martin', 'Tomáš', 'Peter', 'Marek', 'Juraj', 'Matúš'],
            sf: ['Horváthová', 'Kováčová', 'Vargová', 'Balážová', 'Molnárová', 'Tóthová'],
            sm: ['Horváth', 'Kováč', 'Varga', 'Baláž', 'Molnár', 'Tóth']
        },
        lv: {
            f: ['Anna', 'Elīza', 'Laura', 'Marta', 'Sofija', 'Kristīne'],
            m: ['Jānis', 'Andris', 'Kārlis', 'Roberts', 'Mārtiņš', 'Edgars'],
            sf: ['Bērziņa', 'Kalniņa', 'Ozola', 'Liepiņa', 'Krūmiņa', 'Pētersone'],
            sm: ['Bērziņš', 'Kalniņš', 'Ozols', 'Liepiņš', 'Krūmiņš', 'Pētersons']
        },
        uk: {
            f: ['Olivia', 'Amelia', 'Isla', 'Sophie', 'Charlotte', 'Ellie'],
            m: ['Oliver', 'Harry', 'George', 'Jack', 'Alfie', 'Callum'],
            s: ['Smith', 'Jones', 'Taylor', 'Brown', 'Evans', 'Wright', 'Hughes', 'Roberts']
        },
        // ── Món ──
        in: {
            f: ['Priya', 'Ananya', 'Kavya', 'Diya', 'Meera', 'Lakshmi'],
            m: ['Arjun', 'Rohan', 'Aditya', 'Karthik', 'Vikram', 'Siddharth'],
            s: ['Sharma', 'Iyer', 'Nair', 'Reddy', 'Patel', 'Gupta', 'Rao', 'Menon', 'Joshi', 'Kulkarni']
        },
        us: {
            f: ['Emily', 'Hannah', 'Megan', 'Olivia', 'Abigail', 'Grace'],
            m: ['Ethan', 'Tyler', 'Jacob', 'Ryan', 'Austin', 'Caleb'],
            s: ['Johnson', 'Miller', 'Davis', 'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson', 'Harris']
        },
        br: {
            f: ['Ana', 'Juliana', 'Larissa', 'Beatriz', 'Camila', 'Fernanda'],
            m: ['João', 'Gabriel', 'Lucas', 'Rafael', 'Thiago', 'Felipe'],
            s: ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Carvalho', 'Almeida', 'Ribeiro', 'Araújo']
        },
        ar: {
            f: ['Sofía', 'Martina', 'Florencia', 'Agustina', 'Lucía', 'Milagros'],
            m: ['Santiago', 'Facundo', 'Tomás', 'Nicolás', 'Matías', 'Ignacio'],
            s: ['González', 'Rodríguez', 'Fernández', 'López', 'Martínez', 'Pereyra', 'Romero', 'Sosa', 'Acosta', 'Benítez']
        },
        jp: {
            f: ['Yui', 'Aoi', 'Hina', 'Sakura', 'Rin', 'Mio'],
            m: ['Haruto', 'Ren', 'Sota', 'Yuto', 'Kaito', 'Riku'],
            s: ['Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Ito', 'Yamamoto', 'Kobayashi', 'Kato', 'Yoshida']
        },
        mx: {
            f: ['Ximena', 'Valeria', 'Regina', 'Fernanda', 'Andrea', 'Paola'],
            m: ['Emiliano', 'Diego', 'Iker', 'Rodrigo', 'Leonardo', 'Santiago'],
            s: ['Hernández', 'García', 'Martínez', 'López', 'González', 'Ramírez', 'Flores', 'Cruz', 'Morales', 'Reyes']
        },
        pe: {
            f: ['Milagros', 'Rosa', 'Lucía', 'Kiara', 'Daniela', 'Andrea'],
            m: ['Renzo', 'Piero', 'Diego', 'Luis', 'Jhon', 'Joaquín'],
            s: ['Quispe', 'Flores', 'Huamán', 'Mamani', 'Chávez', 'Rojas', 'Vargas', 'Ccori']
        },
        eg: {
            f: ['Mariam', 'Nour', 'Salma', 'Yasmin', 'Habiba', 'Farida'],
            m: ['Omar', 'Youssef', 'Ahmed', 'Mostafa', 'Karim', 'Ziad'],
            s: ['Hassan', 'Mahmoud', 'Ibrahim', 'Sayed', 'Farouk', 'Fathy', 'Ali', 'Abdelaziz']
        },
        ir: {
            f: ['Zahra', 'Fatemeh', 'Sara', 'Maryam', 'Niloufar', 'Shirin'],
            m: ['Amir', 'Reza', 'Mohammad', 'Ali', 'Arash', 'Pouya'],
            s: ['Hosseini', 'Ahmadi', 'Mohammadi', 'Rezaei', 'Karimi', 'Moradi', 'Jafari', 'Rahimi']
        },
        uz: {
            f: ['Madina', 'Dilnoza', 'Shahnoza', 'Malika', 'Gulnora', 'Sevara'],
            m: ['Sardor', 'Jasur', 'Bekzod', 'Otabek', 'Shokhrukh', 'Ulugbek'],
            sf: ['Karimova', 'Rakhimova', 'Yusupova', 'Tursunova', 'Nazarova', 'Saidova'],
            sm: ['Karimov', 'Rakhimov', 'Yusupov', 'Tursunov', 'Nazarov', 'Saidov']
        },
        kz: {
            f: ['Aigerim', 'Dana', 'Aruzhan', 'Madina', 'Asel', 'Aliya'],
            m: ['Nurlan', 'Arman', 'Dauren', 'Yerlan', 'Daniyar', 'Askar'],
            sf: ['Akhmetova', 'Bekova', 'Omarova', 'Sultanova', 'Zhakupova', 'Kassymova'],
            sm: ['Akhmetov', 'Bekov', 'Omarov', 'Sultanov', 'Zhakupov', 'Kassymov']
        },
        au: {
            f: ['Chloe', 'Mia', 'Jessica', 'Sophie', 'Isla', 'Ruby'],
            m: ['Jack', 'Lachlan', 'Cooper', 'Riley', 'Mitchell', 'Liam'],
            s: ['Smith', 'Jones', 'Williams', 'Brown', 'Wilson', 'Taylor', 'Kelly', 'Walker', 'White', 'Martin']
        },
        ca: {
            f: ['Émilie', 'Sarah', 'Megan', 'Justine', 'Kayla', 'Maude'],
            m: ['Liam', 'Nathan', 'Olivier', 'Félix', 'Connor', 'Mathis'],
            s: ['Tremblay', 'Gagnon', 'Roy', 'Côté', 'Bouchard', 'Smith', 'MacDonald', 'Wong', 'Campbell', 'Gauthier']
        },
        za: {
            f: ['Thandiwe', 'Naledi', 'Lerato', 'Zanele', 'Anika', 'Chantelle'],
            m: ['Sipho', 'Thabo', 'Kagiso', 'Lwazi', 'Pieter', 'Ruan'],
            s: ['Nkosi', 'Dlamini', 'Ndlovu', 'Mokoena', 'Botha', 'van der Merwe', 'Khumalo', 'Naidoo']
        },
        ph: {
            f: ['Maria', 'Angelica', 'Kristine', 'Jasmine', 'Patricia', 'Joy'],
            m: ['Mark', 'Rodel', 'Jerome', 'Carlo', 'Paolo', 'Jericho'],
            s: ['Santos', 'Reyes', 'Cruz', 'Bautista', 'Garcia', 'Mendoza', 'Villanueva', 'Dela Cruz']
        },
        vn: {
            order: 'family',
            f: ['Lan', 'Hương', 'Mai', 'Thảo', 'Linh', 'Trang'],
            m: ['An', 'Dũng', 'Hùng', 'Long', 'Tuấn', 'Khoa'],
            mf: ['Thị', 'Ngọc', 'Thu'],
            mm: ['Văn', 'Minh', 'Đức'],
            s: ['Nguyễn', 'Trần', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi', 'Đỗ']
        },
        id: {
            f: ['Putri', 'Dewi', 'Ayu', 'Siti', 'Rina', 'Intan'],
            m: ['Budi', 'Agus', 'Rizki', 'Dimas', 'Fajar', 'Arif'],
            s: ['Santoso', 'Wijaya', 'Saputra', 'Hidayat', 'Pratama', 'Kusuma', 'Setiawan', 'Nugroho']
        },
        cu: {
            f: ['Yailén', 'Daniela', 'Liset', 'Yamila', 'Lisandra', 'Yusleidy'],
            m: ['Yasser', 'Yoandry', 'Reinier', 'Osmany', 'Yunier', 'Alexei'],
            s: ['Pérez', 'Rodríguez', 'González', 'Hernández', 'Díaz', 'Valdés', 'Cabrera', 'Fonseca']
        },
        co: {
            f: ['Valentina', 'Natalia', 'Manuela', 'Laura', 'Daniela', 'Juliana'],
            m: ['Andrés', 'Camilo', 'Sebastián', 'Felipe', 'Esteban', 'Alejandro'],
            s: ['Gómez', 'Restrepo', 'Ospina', 'Cárdenas', 'Zapata', 'Arango', 'Muñoz', 'Valencia']
        },
        mn: {
            f: ['Anu', 'Sarnai', 'Khulan', 'Nomin', 'Solongo', 'Enkhjin'],
            m: ['Temuulen', 'Ganbold', 'Bilguun', 'Tömör', 'Bat-Erdene', 'Erdene'],
            s: ['Batbold', 'Ganbaatar', 'Dorj', 'Bat-Ochir', 'Enkhbayar', 'Tserendorj']
        },
        ng: {
            f: ['Chiamaka', 'Adaeze', 'Funmilayo', 'Ngozi', 'Aisha', 'Temitope'],
            m: ['Chinedu', 'Emeka', 'Oluwaseun', 'Tunde', 'Ibrahim', 'Kelechi'],
            s: ['Okafor', 'Adeyemi', 'Okonkwo', 'Bello', 'Eze', 'Afolabi', 'Nwosu', 'Abubakar']
        },
        cl: {
            f: ['Catalina', 'Antonia', 'Javiera', 'Constanza', 'Fernanda', 'Josefa'],
            m: ['Benjamín', 'Vicente', 'Cristóbal', 'Matías', 'Agustín', 'Maximiliano'],
            s: ['González', 'Muñoz', 'Rojas', 'Díaz', 'Soto', 'Contreras', 'Silva', 'Sepúlveda']
        },
        tr: {
            f: ['Zeynep', 'Elif', 'Defne', 'Ecem', 'Merve', 'Ayşe'],
            m: ['Emre', 'Mert', 'Burak', 'Can', 'Kerem', 'Yusuf'],
            s: ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Aydın', 'Öztürk']
        },
        kr: {
            order: 'family',
            f: ['Ji-woo', 'Seo-yeon', 'Min-ji', 'Ha-eun', 'Su-bin', 'Ye-jin'],
            m: ['Min-jun', 'Seo-jun', 'Ji-ho', 'Do-yun', 'Hyun-woo', 'Jae-won'],
            s: ['Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Cho', 'Yoon']
        },
        nz: {
            f: ['Aroha', 'Mia', 'Hannah', 'Georgia', 'Ella', 'Ngaio'],
            m: ['Tama', 'Liam', 'Hamish', 'Nikau', 'Oliver', 'Blake'],
            s: ['Smith', 'Wilson', 'Thompson', 'Ngata', 'Walker', 'Parata', 'Campbell', 'Tane']
        },
        uy: {
            f: ['Valentina', 'Sofía', 'Agustina', 'Camila', 'Florencia', 'Lucía'],
            m: ['Joaquín', 'Facundo', 'Bruno', 'Martín', 'Rodrigo', 'Gonzalo'],
            s: ['Rodríguez', 'Pereira', 'Fernández', 'Silva', 'Martínez', 'Sosa', 'Olivera', 'Cabrera']
        }
    };

    // Cultura de cada territori dels Països Catalans, i de quins altres
    // orígens és la gent que hi viu (pesos).
    const TERRITORY_CULTURE = { cat: 'cat', val: 'val', bal: 'bal', and: 'and', nord: 'nord', franja: 'franja', alguer: 'alguer' };
    const DIVERSE = {
        cat: [['es', 55], ['latam', 15], ['ma', 12], ['ro', 8], ['cn', 5], ['pk', 5]],
        val: [['es', 65], ['latam', 10], ['ro', 15], ['ma', 10]],
        bal: [['es', 55], ['de', 15], ['latam', 15], ['ma', 10], ['it', 5]],
        and: [['es', 45], ['pt', 45], ['fr', 10]],
        nord: [['fr', 85], ['ma', 15]],
        franja: [['es', 85], ['ro', 15]],
        alguer: [['it', 100]]
    };
    // Proporció de rivals d'altres orígens als nivells de casa (municipal,
    // comarcal, provincial, territori) i als Països Catalans.
    const DIVERSITY_BY_LEVEL = [0, 0.12, 0.25, 0.4, 0.2];
    // País (nom català de localitats.js) → cultura.
    const COUNTRY_CULTURE = {
        'França': 'fr', 'Itàlia': 'it', 'Alemanya': 'de', 'Països Baixos': 'nl', 'Noruega': 'no', 'Polònia': 'pl',
        'Ucraïna': 'ua', 'Hongria': 'hu', 'Portugal': 'pt', 'Grècia': 'gr', 'Suècia': 'se', 'Àustria': 'at',
        'Irlanda': 'ie', 'Txèquia': 'cz', 'Romania': 'ro', 'Croàcia': 'hr', 'Dinamarca': 'dk', 'Bèlgica': 'be',
        'Suïssa': 'ch', 'Finlàndia': 'fi', 'Eslovènia': 'si', 'Lituània': 'lt', 'Estònia': 'ee', 'Islàndia': 'is',
        'Sèrbia': 'rs', 'Geòrgia': 'ge', 'Armènia': 'am', 'Bulgària': 'bg', 'Eslovàquia': 'sk', 'Letònia': 'lv',
        'Índia': 'in', 'Xina': 'cn', 'Estats Units': 'us', 'Brasil': 'br', 'Argentina': 'ar', 'Japó': 'jp',
        'Mèxic': 'mx', 'Perú': 'pe', 'Egipte': 'eg', 'Iran': 'ir', 'Uzbekistan': 'uz', 'Kazakhstan': 'kz',
        'Austràlia': 'au', 'Canadà': 'ca', 'Sud-àfrica': 'za', 'Filipines': 'ph', 'Vietnam': 'vn', 'Indonèsia': 'id',
        'Cuba': 'cu', 'Colòmbia': 'co', 'Mongòlia': 'mn', 'Nigèria': 'ng', 'Marroc': 'ma', 'Xile': 'cl',
        'Turquia': 'tr', 'Corea del Sud': 'kr', 'Nova Zelanda': 'nz', 'Uruguai': 'uy',
        // Altres països que el jugador pot escriure (fora dels Països Catalans).
        'Espanya': 'es', 'Regne Unit': 'uk', 'Anglaterra': 'uk', 'Escòcia': 'uk', 'Gal·les': 'uk', 'Pakistan': 'pk',
        'Equador': 'latam', 'Bolívia': 'latam', 'Veneçuela': 'latam', 'Paraguai': 'latam'
    };
    const EUROPE_CULTURES = ['fr', 'it', 'de', 'nl', 'no', 'pl', 'ua', 'hu', 'pt', 'gr', 'se', 'at', 'ie', 'cz', 'ro',
        'hr', 'dk', 'be', 'ch', 'fi', 'si', 'lt', 'ee', 'is', 'rs', 'ge', 'am', 'bg', 'sk', 'lv', 'uk', 'es'];

    function fold(s) {
        return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
    }
    function pick(list, rnd) {
        return list[Math.floor(rnd() * list.length) % list.length];
    }
    function pickWeighted(pairs, rnd) {
        const total = pairs.reduce(function (s, p) { return s + p[1]; }, 0);
        let r = rnd() * total;
        for (let i = 0; i < pairs.length; i++) { r -= pairs[i][1]; if (r < 0) return pairs[i][0]; }
        return pairs[pairs.length - 1][0];
    }
    function countryCulture(name) {
        if (!name) return null;
        if (COUNTRY_CULTURE[name]) return COUNTRY_CULTURE[name];
        const f = fold(name);
        const hit = Object.keys(COUNTRY_CULTURE).find(function (k) { return fold(k) === f; });
        return hit ? COUNTRY_CULTURE[hit] : null;
    }

    // Un nom de persona d'una cultura: { name, given, surname, culture }.
    function makeName(code, random) {
        const rnd = typeof random === 'function' ? random : Math.random;
        const c = CULTURES[code] || CULTURES.cat;
        const female = rnd() < 0.45;
        const given = pick(female ? c.f : c.m, rnd);
        const surname = pick(female ? (c.sf || c.s) : (c.sm || c.s), rnd);
        const middleList = female ? c.mf : c.mm;
        const middle = middleList ? pick(middleList, rnd) : null;
        const name = c.order === 'family'
            ? [surname, middle, given].filter(Boolean).join(' ')
            : [given, surname].join(' ');
        return { name: name, given: given, surname: surname, culture: code };
    }

    // Cultura del nom d'un rival segons el nivell (0 municipal ... 6 mundial),
    // la localitat del jugador i l'origen del rival. options.territoryOf: ciutat
    // dels Països Catalans → territori (localitats.js).
    function cultureFor(level, home, origin, options) {
        const opts = options || {};
        const rnd = typeof opts.random === 'function' ? opts.random : Math.random;
        const h = home || {};
        if (level >= 5) return countryCulture(origin) || pick(EUROPE_CULTURES, rnd);
        let territory = h.territory || 'cat';
        if (level === 4) {
            const t = typeof opts.territoryOf === 'function' ? opts.territoryOf(origin) : null;
            territory = t || territory;
        }
        if (territory === 'fora') return countryCulture(h.pais) || pick(EUROPE_CULTURES, rnd);
        const base = TERRITORY_CULTURE[territory] || 'cat';
        const share = DIVERSITY_BY_LEVEL[Math.max(0, Math.min(4, level))] || 0;
        if (share > 0 && rnd() < share && DIVERSE[territory]) return pickWeighted(DIVERSE[territory], rnd);
        return base;
    }

    // Noms dels rivals d'una lliga nova: count noms diferents (i, si es pot,
    // sense repetir nom de pila ni cognom), cap dels d'options.exclude (els de
    // les darreres temporades). origins: d'on és cada rival (localitats.js:
    // rivalOrigins).
    function rivalNames(level, home, origins, options) {
        const opts = options || {};
        const rnd = typeof opts.random === 'function' ? opts.random : Math.random;
        const list = Array.isArray(origins) ? origins : [];
        const count = Number.isFinite(opts.count) ? opts.count : (list.length || 9);
        const excluded = new Set((Array.isArray(opts.exclude) ? opts.exclude : []).map(fold));
        const usedNames = new Set(), usedSurnames = new Set(), usedGiven = new Set();
        const out = [];
        for (let i = 0; i < count; i++) {
            const culture = cultureFor(level, home, list[i], { random: rnd, territoryOf: opts.territoryOf });
            // El millor candidat: nom nou; després, cognom nou; i, si pot ser,
            // nom de pila nou.
            let best = null, bestScore = -1;
            for (let k = 0; k < 80 && bestScore < 2; k++) {
                const cand = makeName(culture, rnd);
                const key = fold(cand.name);
                if (usedNames.has(key) || excluded.has(key) || FAMOUS.has(key)) continue;
                const score = (usedSurnames.has(fold(cand.surname)) ? 0 : 1) + (usedGiven.has(fold(cand.given)) ? 0 : 1);
                if (score > bestScore) { best = cand; bestScore = score; }
            }
            const got = best || makeName(culture, rnd);
            usedNames.add(fold(got.name));
            usedSurnames.add(fold(got.surname));
            usedGiven.add(fold(got.given));
            out.push(got.name);
        }
        return out;
    }

    // Persones conegudes que les combinacions podrien donar: no surten mai.
    const FAMOUS = new Set([
        'Xavier Sala', 'Albert Serra', 'Ferran Soler', 'Joan Font', 'Marco Rossi', 'Thiago Silva', 'Lucas Lima',
        'Rui Costa', 'Mads Pedersen', 'Sergio García', 'Javier Fernández', 'Arjun Reddy', 'Ahmed Hassan', 'Ali Karimi',
        'Burak Yılmaz', 'Andrii Melnyk', 'Oleksandr Moroz', 'Wang Lei'
    ].map(fold));

    return {
        CULTURES: CULTURES,
        COUNTRY_CULTURE: COUNTRY_CULTURE,
        DIVERSE: DIVERSE,
        DIVERSITY_BY_LEVEL: DIVERSITY_BY_LEVEL,
        TERRITORY_CULTURE: TERRITORY_CULTURE,
        FAMOUS: FAMOUS,
        fold: fold,
        countryCulture: countryCulture,
        makeName: makeName,
        cultureFor: cultureFor,
        rivalNames: rivalNames
    };
});
