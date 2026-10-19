"""Generate the mock city the console browses: cameras on real Manhattan corners, 500 people with daily
routines, 7 days of camera sightings, cases (numbers) with their lead-up, and who-meets-whom edges.

    .venv/bin/python tools/gen_world.py [--start YYYY-MM-DD]

--start is the first of the 7 days (default: 6 days before today), so the last day is today and the console
can reveal it as the clock runs. The same start date always gives the same world.
Output: web/data/world.json (+ web/media/crops.jpg, body snapshots cut from the stock footage).
Everyone in it is invented. SSNs use group 00, which is never issued.
"""
from __future__ import annotations

import argparse
import bisect
import datetime as dt
import json
import math
import random
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
OUT = WEB / "data" / "world.json"
CLIPS = WEB / "media" / "clips"
CROPS = WEB / "media" / "crops.jpg"
CROP_W, CROP_H, CROP_COLS = 60, 120, 20
DAY = 86400
DAYS = 7
N_PEOPLE = 500
KX, KY = 111320 * math.cos(math.radians(40.758)), 110540
ORIGIN = (40.758, -73.9855)

# name, lat, lon, kind, agency  (kind picks the footage; see tools/build_clips.py)
CAMERAS = [
    ("TIMES SQ / 7 AVE & W 45 ST", 40.7580, -73.9855, "square", "DAS"),
    ("TIMES SQ / BROADWAY & W 47 ST", 40.7592, -73.9847, "square", "DAS"),
    ("GRAND CENTRAL / MAIN CONCOURSE", 40.7527, -73.9772, "station", "MTA"),
    ("GRAND CENTRAL / INFORMATION BOOTH", 40.7529, -73.9769, "station", "MTA"),
    ("42 ST-BRYANT PK STATION", 40.7542, -73.9845, "subway", "MTA"),
    ("BRYANT PARK / UPPER TERRACE", 40.7536, -73.9832, "park", "PKS"),
    ("5 AVE & E 57 ST", 40.7638, -73.9730, "street", "DAS"),
    ("ROCKEFELLER PLAZA", 40.7587, -73.9787, "plaza", "PVT"),
    ("PENN STATION / LIRR CONCOURSE", 40.7506, -73.9935, "station", "MTA"),
    ("HERALD SQ / 6 AVE & W 34 ST", 40.7497, -73.9877, "street", "DAS"),
    ("COLUMBUS CIRCLE", 40.7681, -73.9819, "traffic", "DOT"),
    ("59 ST-COLUMBUS CIRCLE STATION", 40.7683, -73.9814, "subway", "MTA"),
    ("CENTRAL PARK / THE MALL", 40.7724, -73.9710, "park", "PKS"),
    ("CENTRAL PARK W & W 79 ST", 40.7813, -73.9740, "street", "DAS"),
    ("86 ST STATION / LEXINGTON AVE", 40.7795, -73.9556, "subway", "MTA"),
    ("LEXINGTON AVE & E 72 ST", 40.7703, -73.9604, "street", "DAS"),
    ("W 125 ST & LENOX AVE", 40.8080, -73.9455, "street", "DAS"),
    ("COLUMBIA UNIV / COLLEGE WALK", 40.8075, -73.9626, "plaza", "PVT"),
    ("UNION SQ / NORTH PLAZA", 40.7365, -73.9905, "plaza", "PKS"),
    ("14 ST-UNION SQ STATION", 40.7347, -73.9897, "subway", "MTA"),
    ("WASHINGTON SQ PARK / ARCH", 40.7310, -73.9973, "park", "PKS"),
    ("ASTOR PL STATION", 40.7300, -73.9910, "subway", "MTA"),
    ("CANAL ST & MOTT ST", 40.7168, -73.9985, "street", "DAS"),
    ("CITY HALL PARK", 40.7127, -74.0059, "park", "PKS"),
    ("FULTON ST STATION", 40.7101, -74.0076, "subway", "MTA"),
    ("WTC / OCULUS", 40.7115, -74.0110, "station", "PVT"),
    ("WALL ST & BROAD ST", 40.7064, -74.0110, "street", "DAS"),
    ("THORNHILL UTILITIES / SVC CORRIDOR", 40.7086, -74.0141, "facility", "PVT"),
    ("6 AVE & W 23 ST", 40.7428, -73.9928, "street", "DAS"),
    ("HUDSON YARDS / PUBLIC SQ", 40.7538, -74.0021, "plaza", "PVT"),
    ("8 AVE & W 34 ST", 40.7525, -73.9935, "traffic", "DOT"),
    ("1 AVE & E 42 ST / UN", 40.7500, -73.9690, "street", "DAS"),
]
AGENCY = {"DAS": "NYPD DOMAIN AWARENESS", "MTA": "MTA TRANSIT", "DOT": "NYC DOT TRAFFIC",
          "PKS": "NYC PARKS", "PVT": "PRIVATE / TAPPED"}
WORK_HUBS = {"square", "station", "plaza", "street", "facility"}

FIRST = """JAMES MARY ROBERT PATRICIA JOHN JENNIFER MICHAEL LINDA DAVID ELIZABETH WILLIAM BARBARA RICHARD SUSAN JOSEPH
JESSICA THOMAS SARAH CHARLES KAREN CHRISTOPHER LISA DANIEL NANCY MATTHEW BETTY ANTHONY SANDRA MARK MARGARET DONALD
ASHLEY STEVEN KIMBERLY ANDREW EMILY PAUL DONNA JOSHUA MICHELLE KENNETH CAROL KEVIN AMANDA BRIAN MELISSA GEORGE DEBORAH
TIMOTHY STEPHANIE RONALD DOROTHY JASON REBECCA EDWARD SHARON JEFFREY LAURA RYAN CYNTHIA JACOB AMY GARY KATHLEEN
NICHOLAS ANGELA ERIC HELEN JONATHAN ANNA STEPHEN BRENDA LARRY PAMELA JUSTIN EMMA SCOTT NICOLE BRANDON SAMANTHA
BENJAMIN KATHERINE SAMUEL CHRISTINE GREGORY DEBRA ALEXANDER RACHEL PATRICK CAROLYN FRANK JANET RAYMOND MARIA JACK
OLIVIA DENNIS HEATHER JERRY DIANE TYLER JULIE AARON JOYCE JOSE VICTORIA ADAM RUTH NATHAN VIRGINIA HENRY LAUREN
ZACHARY KELLY DOUGLAS CHRISTINA PETER JOAN KYLE EVELYN NOAH JUDITH ETHAN ANDREA JEREMY HANNAH WALTER MEGAN CHRISTIAN
CHERYL KEITH JACQUELINE ROGER MARTHA TERRY MADISON AUSTIN TERESA SEAN GLORIA GERALD SARA CARL JANICE HAROLD ANN
DYLAN KATHRYN ARTHUR ABIGAIL LAWRENCE SOPHIA JORDAN FRANCES JESSE JEAN BRYAN ALICE BILLY JUDY BRUCE ISABELLA GABRIEL
JULIA JOE GRACE LOGAN AMBER ALAN DENISE JUAN DANIELLE ALBERT MARILYN WILLIE BEVERLY ELIJAH CHARLOTTE WAYNE NATALIE
RANDY THERESA VINCENT DIANA MASON BRITTANY ROY DORIS RALPH KAYLA BOBBY ALEXIS RUSSELL LORI BRADLEY MARIE PHILIP WEI
MEI HIROSHI YUKI RAJ PRIYA OMAR FATIMA DMITRI ANYA LUIS CARMEN MATEO SOFIA KWAME AMARA TOMAS ELENA IGOR NADIA""".split()
LAST = """SMITH JOHNSON WILLIAMS BROWN JONES GARCIA MILLER DAVIS RODRIGUEZ MARTINEZ HERNANDEZ LOPEZ GONZALEZ WILSON
ANDERSON THOMAS TAYLOR MOORE JACKSON MARTIN LEE PEREZ THOMPSON WHITE HARRIS SANCHEZ CLARK RAMIREZ LEWIS ROBINSON
WALKER YOUNG ALLEN KING WRIGHT SCOTT TORRES NGUYEN HILL FLORES GREEN ADAMS NELSON BAKER HALL RIVERA CAMPBELL MITCHELL
CARTER ROBERTS GOMEZ PHILLIPS EVANS TURNER DIAZ PARKER CRUZ EDWARDS COLLINS REYES STEWART MORRIS MORALES MURPHY COOK
ROGERS GUTIERREZ ORTIZ MORGAN COOPER PETERSON BAILEY REED KELLY HOWARD RAMOS KIM COX WARD RICHARDSON WATSON BROOKS
CHAVEZ WOOD JAMES BENNETT GRAY MENDOZA RUIZ HUGHES PRICE ALVAREZ CASTILLO SANDERS PATEL MYERS LONG ROSS FOSTER
JIMENEZ POWELL JENKINS PERRY RUSSELL SULLIVAN BELL COLEMAN BUTLER HENDERSON BARNES GONZALES FISHER VASQUEZ SIMMONS
ROMERO JORDAN PATTERSON ALEXANDER HAMILTON GRAHAM REYNOLDS GRIFFIN WALLACE MORENO WEST COLE HAYES BRYANT HERRERA
GIBSON ELLIS TRAN MEDINA AGUILAR STEVENS MURRAY FORD CASTRO MARSHALL OWENS HARRISON FERNANDEZ MCDONALD WOODS
WASHINGTON KENNEDY WELLS VARGAS HENRY CHEN FREEMAN WEBB TUCKER GUZMAN BURNS CRAWFORD OLSON SIMPSON PORTER HUNTER
GORDON MENDEZ SILVA SHAW SNYDER MASON DIXON MUNOZ HUNT HICKS HOLMES PALMER WAGNER BLACK ROBERTSON BOYD ROSE STONE
SALAZAR FOX WARREN MILLS MEYER RICE SCHMIDT GARZA DANIELS FERGUSON NICHOLS STEPHENS SOTO WEAVER RYAN GARDNER PAYNE
GRANT DUNN KELLEY SPENCER HAWKINS ARNOLD PIERCE HANSEN PETERS SANTOS HART BRADLEY KNIGHT ELLIOTT CUNNINGHAM DUNCAN
ARMSTRONG HUDSON CARROLL LANE RILEY ANDREWS ALVARADO RAY DELGADO BERRY PERKINS HOFFMAN JOHNSTON MATTHEWS PENA
RICHARDS WILLIS CARPENTER LAWRENCE SANDOVAL GUERRERO GEORGE CHAPMAN RIOS ESTRADA ORTEGA WATKINS GREENE NUNEZ
WHEELER VALDEZ HARPER BURKE LARSON SANTIAGO MALDONADO MORRISON FRANKLIN CARLSON AUSTIN DOMINGUEZ CARR LAWSON JACOBS
OBRIEN LYNCH SINGH VEGA BISHOP MONTGOMERY OLIVER JENSEN HARVEY WILLIAMSON GILBERT DEAN SIMS ESPINOZA HOWELL LI WONG
REID HANSON LE MCCOY GARRETT BURTON FULLER WANG WEBER WELCH ROJAS LUCAS MARQUEZ FIELDS PARK YANG LITTLE BANKS
PADILLA DAY WALSH BOWMAN SCHULTZ LUNA FOWLER MEJIA DAVIDSON ACOSTA BREWER MAY HOLLAND JUAREZ NEWMAN PEARSON CURTIS
CORTEZ DOUGLAS SCHNEIDER JOSEPH BARRETT NAVARRO FIGUEROA KELLER AVILA WADE MOLINA STANLEY HOPKINS CAMPOS BARNETT
BATES CHAMBERS CALDWELL BECK LAMBERT MIRANDA BYRD CRAIG AYALA LOWE FRAZIER POWERS NEAL LEONARD GREGORY CARRILLO
SUTTON FLEMING RHODES SHELTON SCHWARTZ NORRIS JENNINGS WATTS DURAN WALTERS COHEN MCDANIEL MORAN PARKS STEELE VAUGHN
BECKER HOLT DELEON BARKER TERRY HALE LEON HAIL BENSON HAYNES HORTON MILES LYONS PHAM GRAVES BUSH THORNTON WOLFE
WARNER CABRERA MCKINNEY MANN ZIMMERMAN DAWSON LARA FLETCHER PAGE MCCARTHY LOVE ROBLES CERVANTES SOLIS ERICKSON
REEVES CHANG KLEIN SALINAS FUENTES BALDWIN DANIEL SIMON VELASQUEZ HARDY HIGGINS AGUIRRE LIN CUMMINGS CHANDLER
SHARP BARBER BOWEN OCHOA DENNIS ROBBINS LIU RAMSEY FRANCIS GRIFFITH PAUL BLAIR OCONNOR CARDENAS PACHECO CROSS
CALDERON QUINN MOSS SWANSON CHAN RIVAS KHAN RODGERS SERRANO FITZGERALD ROSALES STEVENSON CHRISTENSEN MANNING GILL
CURRY MCLAUGHLIN HARMON MCGEE GROSS DOYLE GARNER NEWTON BURGESS REESE WALTON BLAKE TRUJILLO ADKINS BRADY GOODMAN
ROMAN WEBSTER GOODWIN FISCHER HUANG POTTER DELACRUZ MONTOYA TODD WU HINES MULLINS CASTANEDA MALONE CANNON TATE
MACK SHERMAN HUBBARD HODGES ZHANG GUERRA WOLF VALENCIA SAUNDERS FRANCO ROWE GALLAGHER FARMER HAMMOND HAMPTON
TOWNSEND INGRAM WISE GALLEGOS CLARKE BARTON SCHROEDER MAXWELL WATERS LOGAN CAMACHO STRICKLAND NORMAN PERSON
COLON PARSONS FRANK HARRINGTON GLOVER OSBORNE BUCHANAN CASEY FLOYD PATTON IBARRA BALL TYLER SUAREZ BOWERS OROZCO
SALAS COBB GIBBS ANDRADE BAUER CONNER MOODY ESCOBAR MCGUIRE LLOYD MUELLER HARTMAN FRENCH KRAMER MCBRIDE POPE
LINDSEY VELAZQUEZ NORTON MCCORMICK SPARKS FLYNN YATES HOGAN MARSH MACIAS VILLANUEVA ZAMORA PRATT STOKES OWEN
BALLARD LANG BROCK VILLARREAL CHARLES DRAKE BARRERA CAIN PATRICK PINEDA BURNETT MERCADO SANTANA SHEPHERD BAUTISTA
ALI SHAFFER LAMB TREVINO MCKENZIE HESS BEIL OLSEN COCHRAN MORTON NASH WILKINS PETERSEN BRIGGS SHAH ROTH NICHOLSON
HOLLOWAY LOZANO RANGEL FLOWERS HOOVER SHORT ARIAS MORA VALENZUELA BRYAN MEYERS WEISS UNDERWOOD BELL""".split()
_OCC = ["ACCOUNTANT", "BARISTA", "BIKE MESSENGER", "BUILDING SUPERINTENDENT", "BUS OPERATOR", "CAB DRIVER", "CHEF",
        "CLAIMS ADJUSTER", "CONSTRUCTION FOREMAN", "CORRECTIONS OFFICER", "DATA ANALYST", "DENTAL HYGIENIST",
        "DOORMAN", "EMT", "FINANCIAL ADVISOR", "FOOD CART VENDOR", "GRAPHIC DESIGNER", "HEDGE FUND ANALYST",
        "HOSPITAL ORDERLY", "HOTEL CONCIERGE", "INSURANCE BROKER", "JANITOR", "JOURNALIST", "LAW CLERK", "LINE COOK",
        "LOAN OFFICER", "MAIL CARRIER", "NURSE", "PARALEGAL", "PHARMACIST", "PHOTOGRAPHER", "PROPERTY MANAGER",
        "REAL ESTATE AGENT", "RETAIL MANAGER", "SECURITY GUARD", "SOFTWARE ENGINEER", "STOCKBROKER", "STUDENT",
        "SUBWAY CONDUCTOR", "TEACHER", "TRADER", "UNEMPLOYED", "WAITER", "WAREHOUSE CLERK", "ATTORNEY", "ARCHITECT",
        "BARTENDER", "PERSONAL TRAINER", "TAILOR", "LOCKSMITH"]
STREETS = ["W 46TH ST", "E 9TH ST", "AVENUE B", "MULBERRY ST", "W 104TH ST", "AMSTERDAM AVE", "E 86TH ST", "BLEECKER ST",
           "LUDLOW ST", "W 23RD ST", "LEXINGTON AVE", "RIVERSIDE DR", "ST NICHOLAS AVE", "ORCHARD ST", "PEARL ST",
           "W 72ND ST", "E 116TH ST", "BROOME ST", "CHRISTOPHER ST", "MADISON AVE", "1ST AVE", "YORK AVE",
           "HUDSON ST", "WATER ST", "E 2ND ST", "W 57TH ST", "CONVENT AVE", "DYCKMAN ST", "GRAND ST", "SPRING ST"]
COLORS = ["BLACK", "BLACK", "BLACK", "NAVY", "GREY", "GREY", "WHITE", "BEIGE", "OLIVE", "RED", "BLUE", "BROWN", "DENIM"]
BUILDS = ["SLIM", "AVERAGE", "AVERAGE", "ATHLETIC", "HEAVY"]

# the show's people. FINCH is the Admin; the real enrolled Admin joins from the live server.
CAST = [
    ("FINCH, HAROLD", "ADMIN", "SOFTWARE ENGINEER (ALIAS: HAROLD WREN)", "1960-11-13"),
    ("GROVES, SAMANTHA", "ANALOG INTERFACE", "UNKNOWN (ALIAS: ROOT)", "1984-03-02"),
    ("REESE, JOHN", "PRIMARY ASSET", "NYPD DETECTIVE (ALIAS: JOHN RILEY)", "1970-08-29"),
    ("SHAW, SAMEEN", "PRIMARY ASSET", "COSMETICS COUNTER CLERK (COVER)", "1980-04-08"),
    ("FUSCO, LIONEL", "SECONDARY ASSET", "NYPD DETECTIVE, 8TH PRECINCT", "1965-05-11"),
    ("CARTER, JOCELYN", "SECONDARY ASSET", "NYPD DETECTIVE, HOMICIDE", "1972-12-15"),
]
CASE_TYPES = [  # kind, weight, list
    ("STALKING", 5, "IRRELEVANT"), ("ROBBERY", 4, "IRRELEVANT"), ("WORKPLACE", 3, "IRRELEVANT"),
    ("DOMESTIC", 2, "IRRELEVANT"), ("MEDICAL", 3, "IRRELEVANT"), ("CONSPIRACY", 2, "RELEVANT"),
    ("ASSET AT RISK", 2, "RELEVANT"),
]
CODEWORDS = ["ALPHA", "BRAVO", "CHARLIE", "DELTA", "ECHO", "FOXTROT", "GOLF", "HOTEL", "INDIA", "JULIET", "KILO",
             "LIMA", "MIKE", "NOVEMBER", "OSCAR", "PAPA", "QUEBEC", "ROMEO", "SIERRA", "TANGO", "UNIFORM", "VICTOR",
             "WHISKEY", "X-RAY", "YANKEE", "ZULU", "HARBOR", "NORTHERN", "LIGHT", "VIGILANCE"]


def xy(lat, lon):
    return round((lon - ORIGIN[1]) * KX), round((lat - ORIGIN[0]) * KY)


class World:
    def __init__(self, start: dt.date):
        self.start = start
        self.r = random.Random(f"the-machine/{start.isoformat()}")
        self.cams = []
        self.people = []
        self.sight = []  # (t, dur, pid, cam)
        self.cases = []

    # ------------------------------------------------------------ cameras
    def build_cameras(self):
        clips = json.loads((CLIPS / "index.json").read_text())
        by_kind = defaultdict(list)
        for c in clips:
            by_kind[c["kind"]].append(c)
        fallback = {"traffic": "street", "facility": "street"}
        used = defaultdict(int)
        for i, (name, lat, lon, kind, ag) in enumerate(CAMERAS):
            pool = by_kind.get(kind) or by_kind[fallback.get(kind, "street")]
            n = used[kind]
            used[kind] += 1
            clip = pool[n % len(pool)]
            x, y = xy(lat, lon)
            self.cams.append({"id": f"{ag}-{self.r.randint(1000, 9999)}", "name": name, "kind": kind,
                              "agency": AGENCY[ag], "x": x, "y": y, "clip": clip["id"],
                              "mirror": (n // len(pool)) % 2 == 1, "offset": round(self.r.random() * clip["dur"], 2)})

    def dist(self, a, b):
        return math.hypot(self.cams[a]["x"] - self.cams[b]["x"], self.cams[a]["y"] - self.cams[b]["y"])

    def route(self, a, b):
        """Cameras on the way from a to b: within 500 m of the straight line, in order."""
        ax, ay, bx, by = self.cams[a]["x"], self.cams[a]["y"], self.cams[b]["x"], self.cams[b]["y"]
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy or 1
        out = []
        for i, c in enumerate(self.cams):
            if i in (a, b):
                continue
            u = ((c["x"] - ax) * dx + (c["y"] - ay) * dy) / L2
            if 0.05 < u < 0.95:
                px, py = ax + u * dx, ay + u * dy
                if math.hypot(c["x"] - px, c["y"] - py) < 500:
                    out.append((u, i))
        return [i for _, i in sorted(out)]

    # ------------------------------------------------------------ people
    def build_people(self):
        r = self.r
        used = set()
        roles = (["THREAT"] * 14 + ["PERSON OF INTEREST"] * 26 +
                 ["IRRELEVANT"] * (N_PEOPLE - len(CAST) - 40))
        r.shuffle(roles)
        hubs = [i for i, c in enumerate(self.cams) if c["kind"] in WORK_HUBS]
        for i in range(N_PEOPLE):
            if i < len(CAST):
                name, role, occ, dob = CAST[i]
            else:
                while True:
                    name = f"{r.choice(LAST)}, {r.choice(FIRST)}"
                    if name not in used:
                        break
                role = roles[i - len(CAST)]
                occ = r.choice(_OCC)
                dob = dt.date(r.randint(1950, 2005), r.randint(1, 12), r.randint(1, 28)).isoformat()
            used.add(name)
            home = r.randrange(len(self.cams))
            work = r.choice(hubs) if occ not in ("UNEMPLOYED",) else None
            if work == home:
                work = None
            p = {
                "id": f"S{i:04d}", "name": name, "role": role,
                "ssn": f"{r.randint(100, 899):03d}-00-{r.randint(1000, 9999):04d}",
                "dob": dob, "occ": occ,
                "addr": f"{r.randint(2, 480)} {r.choice(STREETS)}, NEW YORK, NY",
                "home": home, "work": work,
                "attrs": {"height": r.randint(155, 195), "build": r.choice(BUILDS), "top": r.choice(COLORS),
                          "bottom": r.choice(COLORS), "glasses": r.random() < 0.3, "hat": r.random() < 0.2,
                          "bag": r.random() < 0.45, "phone": r.random() < 0.7},
                "risk": round(r.uniform(0.0, 0.08), 3),
                "crop": i,
                "flags": [],
                "night": r.random() < 0.25,  # night owls keep the late feeds alive
            }
            if role == "THREAT":
                p["risk"] = round(r.uniform(0.35, 0.7), 3)
                p["flags"].append(r.choice(["PRIOR ASSAULT", "WEAPONS PURCHASE", "PROTECTIVE ORDER", "PRIOR ROBBERY",
                                             "GANG AFFILIATION", "PAROLE VIOLATION"]))
            elif role == "PERSON OF INTEREST":
                p["risk"] = round(r.uniform(0.12, 0.35), 3)
                p["flags"].append(r.choice(["IRREGULAR MOVEMENT", "ENCRYPTED COMMS", "CASH STRUCTURING",
                                             "COUNTER-SURVEILLANCE", "FALSE IDENTITY", "OFFSHORE TRANSFERS"]))
            self.people.append(p)

    def see(self, t, dur, pid, cam):
        if 0 <= t < DAYS * DAY:
            self.sight.append((int(t), max(4, int(dur)), pid, cam))

    def travel(self, pid, a, b, t, p_seen=0.75):
        """Walk/ride from camera a to camera b leaving at t. Returns arrival time."""
        r = self.r
        for i in [a] + self.route(a, b) + [b]:
            d = self.dist(a, i)
            at = t + d / r.uniform(5, 9)  # subway-ish average speed, m/s
            if r.random() < p_seen or i in (a, b):
                self.see(at, r.uniform(15, 90), pid, i)
        return t + self.dist(a, b) / 7 + 60

    def routines(self):
        r = self.r
        for pid, p in enumerate(self.people):
            if p["role"] == "ADMIN":
                continue  # the Admin stays off camera, as in the show
            for d in range(DAYS):
                day0 = d * DAY
                weekend = (self.start + dt.timedelta(days=d)).weekday() >= 5
                home = p["home"]
                if p["work"] is not None and not weekend and r.random() < 0.93:
                    leave = day0 + r.gauss(8.2, 0.7) * 3600
                    arrive = self.travel(pid, home, p["work"], leave)
                    self.see(arrive, r.uniform(60, 600), pid, p["work"])
                    if r.random() < 0.4:  # lunch
                        lunch = day0 + r.gauss(12.6, 0.4) * 3600
                        near = min((c for c in range(len(self.cams)) if c != p["work"]),
                                   key=lambda c: self.dist(c, p["work"]) + r.uniform(0, 900))
                        self.see(lunch, r.uniform(300, 2400), pid, near)
                    back = day0 + r.gauss(18.0, 1.0) * 3600
                    self.see(back - 120, r.uniform(30, 300), pid, p["work"])
                    self.travel(pid, p["work"], home, back)
                else:
                    self.see(day0 + r.gauss(10, 1.5) * 3600, r.uniform(60, 900), pid, home)
                for _ in range(r.choice([0, 0, 1, 1, 2]) + (1 if weekend else 0)):
                    dest = r.randrange(len(self.cams))
                    t = day0 + r.uniform(11, 26 if p["night"] else 22) * 3600
                    arr = self.travel(pid, home, dest, t, 0.5)
                    self.see(arr, r.uniform(120, 3600), pid, dest)
                if p["role"] == "PERSON OF INTEREST" and r.random() < 0.35:  # odd hours
                    self.see(day0 + r.uniform(1, 4.5) * 3600, r.uniform(300, 1800), pid, r.randrange(len(self.cams)))
                if p["role"] == "THREAT" and r.random() < 0.3:  # loitering
                    self.see(day0 + r.uniform(20, 26) * 3600, r.uniform(1200, 3600), pid, r.randrange(len(self.cams)))

    # ------------------------------------------------------------ cases
    def build_cases(self):
        r = self.r
        pool = defaultdict(list)
        for i, p in enumerate(self.people):
            pool[p["role"]].append(i)
        assets = [i for i, p in enumerate(self.people) if p["role"] in ("PRIMARY ASSET",)]
        helpers = [i for i, p in enumerate(self.people) if p["role"] in ("SECONDARY ASSET",)]
        busy_victims = set()
        kinds, weights = zip(*[(k, w) for k, w, _ in CASE_TYPES])
        lists = {k: l for k, _, l in CASE_TYPES}
        n = 0
        for d in range(DAYS):
            for _ in range(r.choice([3, 4, 4, 5])):
                kind = r.choices(kinds, weights)[0]
                victim = r.choice([v for v in pool["IRRELEVANT"] if v not in busy_victims])
                busy_victims.add(victim)
                perp = r.choice(pool["THREAT"])
                T = d * DAY + r.uniform(7, 23.5) * 3600  # when it happens
                vp = self.people[victim]
                cam = vp["work"] if vp["work"] is not None and r.random() < 0.5 else vp["home"]
                ev, people = [], [victim]
                prob = r.uniform(0.03, 0.12)

                def add(t, c, k, text, p_, who=()):
                    ev.append({"t": int(t), "cam": c, "kind": k, "text": text, "p": round(p_, 3), "who": list(who)})

                if kind == "MEDICAL":
                    people = [victim]
                    self.see(T - 300, 600, victim, cam)
                    add(T - 240, cam, "OBSERVE", "SUBJECT ACQUIRED", 0.02, [victim])
                    add(T, cam, "DOWN", "SUBJECT DOWN", 0.71, [victim])
                    issue = T + 8
                    outcome = r.choice(["EMS DISPATCHED. SUBJECT STABLE", "EMS DISPATCHED. SUBJECT RECOVERED"])
                elif kind == "CONSPIRACY":
                    cell = r.sample(pool["PERSON OF INTEREST"], 4)
                    people = cell
                    victim = cell[0]
                    for k in range(3):
                        mt = T - (3 - k) * r.uniform(0.6, 1.4) * DAY
                        mt = mt - (mt % DAY) + r.uniform(1.5, 4.5) * 3600
                        mc = r.randrange(len(self.cams))
                        for j, m in enumerate(cell):
                            self.see(mt + j * r.uniform(20, 140), r.uniform(600, 1500), m, mc)
                        prob = min(0.95, prob + r.uniform(0.15, 0.25))
                        add(mt, mc, "PATTERN", f"COVERT MEETING {k + 1}: 4 SUBJECTS CO-LOCATED", prob, cell)
                    cam = mc
                    add(T, cam, "INTERCEPT", "ENCRYPTED TRANSMISSION INTERCEPTED", min(0.97, prob + 0.1), cell)
                    issue = T + 60
                    outcome = "DISSEMINATED. RELEVANT LIST"
                else:
                    if kind == "ASSET AT RISK":
                        victim = r.choice(helpers)
                        vp = self.people[victim]
                        cam = r.randrange(len(self.cams))
                    people = [victim, perp]
                    lead_days = {"STALKING": 4, "ROBBERY": 1, "WORKPLACE": 3, "DOMESTIC": 2, "ASSET AT RISK": 2}[kind]
                    steps = {"STALKING": 5, "ROBBERY": 3, "WORKPLACE": 4, "DOMESTIC": 3, "ASSET AT RISK": 3}[kind]
                    for k in range(steps):
                        st = T - lead_days * DAY * (1 - k / steps) - r.uniform(0, 4 * 3600)
                        sc = cam if r.random() < 0.6 else r.randrange(len(self.cams))
                        self.see(st, r.uniform(60, 400), victim, sc)
                        lag = r.uniform(15, 120)
                        self.see(st + lag, r.uniform(60, 600), perp, sc)
                        prob = min(0.9, prob + r.uniform(0.08, 0.17))
                        text = {"STALKING": f"SUBJECT FOLLOWED. {int(lag)} S BEHIND",
                                "ROBBERY": "SUBJECT SURVEILLING LOCATION",
                                "WORKPLACE": "HOSTILE CONTACT AT WORKPLACE",
                                "DOMESTIC": "ESCALATING CONTACT",
                                "ASSET AT RISK": "ASSET UNDER SURVEILLANCE"}[kind]
                        add(st + lag, sc, "PATTERN", text, prob, [victim, perp])
                    issue = T - r.uniform(1.5, 14) * 3600  # the Machine sees it coming
                    self.see(T - 200, 500, victim, cam)
                    self.see(T - 90, 300, perp, cam)
                    add(T - 60, cam, "ARMED", f"WEAPON DETECTED: {r.choice(['KNIFE', 'HANDGUN', 'BAT'])}",
                        min(0.97, prob + 0.2), [perp])
                    add(T, cam, "HOSTILE", "THREAT ACTIVE", min(0.99, prob + 0.3), [perp])
                    outcome = r.choices(["THREAT NEUTRALIZED. SUBJECT SAFE", "PERPETRATOR IN NYPD CUSTODY",
                                         "SUBJECT SAFE", "SUBJECT DECEASED"], [5, 4, 3, 1])[0]
                # number goes out, an asset is assigned and moves in
                subject = victim if kind in ("MEDICAL", "CONSPIRACY", "ASSET AT RISK") or r.random() < 0.7 else perp
                lst = lists[kind]
                asset = r.choice(assets)
                p_issue = max(e["p"] for e in ev if e["t"] <= issue) if any(e["t"] <= issue for e in ev) else prob
                add(issue, cam, "NUMBER", "NUMBER ISSUED", p_issue, [subject])
                if kind not in ("CONSPIRACY",):
                    start_cam = r.randrange(len(self.cams))
                    dep = issue + r.uniform(300, 1800)
                    add(dep, start_cam, "ASSET", f"ASSET DEPLOYED: {self.people[asset]['name']}", p_issue, [asset])
                    arr = self.travel(asset, start_cam, cam, dep, 0.9)
                    arr = min(arr, T - 120) if kind != "MEDICAL" else arr
                    self.see(arr, max(300, T - arr + 600), asset, cam)
                    people.append(asset)
                closed = T + r.uniform(5, 40) * 60
                add(closed, cam, "CLOSED", outcome, 0.01 if "DECEASED" not in outcome else 1.0, [subject])
                ev.sort(key=lambda e: e["t"])
                code = "; ".join(", ".join(r.sample(CODEWORDS, 3)).title().split("; "))
                self.cases.append({
                    "id": f"N{n:03d}", "kind": kind, "list": lst, "number": self.people[subject]["ssn"],
                    "subject": subject, "victim": victim, "perp": perp if kind not in ("MEDICAL", "CONSPIRACY") else None,
                    "people": sorted(set(people)), "cam": cam, "issued": int(issue), "due": int(T), "closed": int(closed),
                    "outcome": outcome, "asset": asset if kind != "CONSPIRACY" else None, "code": code, "events": ev,
                })
                n += 1
        self.cases.sort(key=lambda c: c["issued"])
        for i, c in enumerate(self.cases):
            c["id"] = f"N{i + 1:03d}"
            self.people[c["subject"]]["flags"].append(f"NUMBER {c['id']}")

    # ------------------------------------------------------------ relations
    def build_edges(self):
        by_cam = defaultdict(list)
        for t, d, p, c in self.sight:
            by_cam[c].append((t, p))
        pair = defaultdict(lambda: [0, 10**9, 0])
        for c, lst in by_cam.items():
            lst.sort()
            ts = [t for t, _ in lst]
            for i, (t, p) in enumerate(lst):
                j = bisect.bisect_right(ts, t + 150)
                for t2, q in lst[i + 1: j]:
                    if q == p:
                        continue
                    k = (min(p, q), max(p, q))
                    e = pair[k]
                    e[0] += 1
                    e[1] = min(e[1], t)
                    e[2] = max(e[2], t2)
        case_pairs = set()
        for cs in self.cases:
            ps = cs["people"]
            for a in ps:
                for b in ps:
                    if a < b:
                        case_pairs.add((a, b))
        edges = [[a, b, n, f, l] for (a, b), (n, f, l) in pair.items() if n >= 5 or (a, b) in case_pairs]
        return edges

    # ------------------------------------------------------------ crops
    def build_crops(self):
        try:
            import cv2
            import numpy as np
        except ImportError:
            print("opencv missing: no crops")
            return 0
        skip = {"4832", "32614", "32617", "4855", "4338"}  # close-ups and traffic
        cells = []
        for meta in sorted(CLIPS.glob("*.json")):
            cid = meta.stem
            if cid in skip or cid == "index":
                continue
            m = json.loads(meta.read_text())
            spans = defaultdict(list)
            for fi, fr in enumerate(m["frames"]):
                for tid, x1, y1, x2, y2 in fr:
                    if y2 - y1 > 190 and x1 > 5 and x2 < 995 and y1 > 5 and y2 < 995 and (x2 - x1) * 1.78 < (y2 - y1):
                        spans[tid].append((fi, x1, y1, x2, y2))
            cap = cv2.VideoCapture(str(CLIPS / f"{cid}.mp4"))
            vfps = cap.get(cv2.CAP_PROP_FPS) or 25
            for tid, lst in spans.items():
                if len(lst) < 5:
                    continue
                fi, x1, y1, x2, y2 = lst[len(lst) // 2]
                cap.set(cv2.CAP_PROP_POS_FRAMES, int(fi / m["fps"] * vfps))
                ok, img = cap.read()
                if not ok:
                    continue
                H, W = img.shape[:2]
                bx1, by1, bx2, by2 = x1 * W // 1000, y1 * H // 1000, x2 * W // 1000, y2 * H // 1000
                cx, bw = (bx1 + bx2) / 2, (by2 - by1) / 2  # crop to 1:2 around the box
                a, b = int(max(0, cx - bw / 2)), int(min(W, cx + bw / 2))
                crop = img[by1:by2, a:b]
                if crop.size == 0:
                    continue
                cells.append(cv2.resize(crop, (CROP_W, CROP_H), interpolation=cv2.INTER_AREA))
        self.r.shuffle(cells)
        cells += [cv2.flip(c, 1) for c in cells]  # mirrored copies double the pool
        if not cells:
            return 0
        rows = (len(cells) + CROP_COLS - 1) // CROP_COLS
        sheet = np.zeros((rows * CROP_H, CROP_COLS * CROP_W, 3), np.uint8)
        for i, c in enumerate(cells):
            y, x = divmod(i, CROP_COLS)
            sheet[y * CROP_H:(y + 1) * CROP_H, x * CROP_W:(x + 1) * CROP_W] = c
        cv2.imwrite(str(CROPS), sheet, [cv2.IMWRITE_JPEG_QUALITY, 72])
        return len(cells)

    # ------------------------------------------------------------ out
    def write(self):
        n_crops = self.build_crops()
        for p in self.people:
            p["crop"] = p["crop"] % n_crops if n_crops else -1
        self.sight.sort()
        edges = self.build_edges()
        s = self.sight
        out = {
            "start": self.start.isoformat(), "days": DAYS, "origin": ORIGIN,
            "crop": {"w": CROP_W, "h": CROP_H, "cols": CROP_COLS, "n": n_crops},
            "cameras": self.cams, "people": self.people, "cases": self.cases,
            "sightings": {"t": [x[0] for x in s], "d": [x[1] for x in s], "p": [x[2] for x in s], "c": [x[3] for x in s]},
            "edges": edges,
        }
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(out, separators=(",", ":")))
        print(f"start {self.start}  cameras {len(self.cams)}  people {len(self.people)}  sightings {len(s)}  "
              f"cases {len(self.cases)}  edges {len(edges)}  crops {n_crops}  -> {OUT.stat().st_size // 1024} KB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", help="first day, YYYY-MM-DD (default: 6 days ago)")
    a = ap.parse_args()
    start = dt.date.fromisoformat(a.start) if a.start else dt.date.today() - dt.timedelta(days=DAYS - 1)
    w = World(start)
    w.build_cameras()
    w.build_people()
    w.routines()
    w.build_cases()
    w.write()


if __name__ == "__main__":
    main()
