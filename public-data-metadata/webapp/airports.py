"""ICAO airport code -> human-readable name lookup (public reference data).

Covers major/hub airports likely to show up as OpenSky's estDepartureAirport
/ estArrivalAirport. Not exhaustive - unmatched codes are shown as their raw
ICAO code rather than guessed.
"""

ICAO_AIRPORTS = {
    "KJFK": ("New York John F. Kennedy", "New York", "US"), "KLAX": ("Los Angeles Intl", "Los Angeles", "US"),
    "KORD": ("Chicago O'Hare", "Chicago", "US"), "KATL": ("Hartsfield-Jackson Atlanta", "Atlanta", "US"),
    "KDFW": ("Dallas/Fort Worth", "Dallas", "US"), "KDEN": ("Denver Intl", "Denver", "US"),
    "KSFO": ("San Francisco Intl", "San Francisco", "US"), "KSEA": ("Seattle-Tacoma", "Seattle", "US"),
    "KMIA": ("Miami Intl", "Miami", "US"), "KBOS": ("Boston Logan", "Boston", "US"),
    "KEWR": ("Newark Liberty", "Newark", "US"), "KIAD": ("Washington Dulles", "Washington", "US"),
    "KPHX": ("Phoenix Sky Harbor", "Phoenix", "US"), "KLAS": ("Las Vegas Harry Reid", "Las Vegas", "US"),
    "KIAH": ("Houston George Bush", "Houston", "US"), "KMCO": ("Orlando Intl", "Orlando", "US"),
    "KMSP": ("Minneapolis-Saint Paul", "Minneapolis", "US"), "KDTW": ("Detroit Metro", "Detroit", "US"),
    "KPHL": ("Philadelphia Intl", "Philadelphia", "US"), "KCLT": ("Charlotte Douglas", "Charlotte", "US"),
    "CYYZ": ("Toronto Pearson", "Toronto", "CA"), "CYVR": ("Vancouver Intl", "Vancouver", "CA"),
    "CYUL": ("Montreal-Trudeau", "Montreal", "CA"),
    "EGLL": ("London Heathrow", "London", "GB"), "EGKK": ("London Gatwick", "London", "GB"),
    "EGSS": ("London Stansted", "London", "GB"), "EGCC": ("Manchester", "Manchester", "GB"),
    "EDDF": ("Frankfurt am Main", "Frankfurt", "DE"), "EDDM": ("Munich", "Munich", "DE"),
    "EDDB": ("Berlin Brandenburg", "Berlin", "DE"), "EDDL": ("Dusseldorf", "Dusseldorf", "DE"),
    "EDDH": ("Hamburg", "Hamburg", "DE"),
    "LFPG": ("Paris Charles de Gaulle", "Paris", "FR"), "LFPO": ("Paris Orly", "Paris", "FR"),
    "LEMD": ("Madrid Barajas", "Madrid", "ES"), "LEBL": ("Barcelona El Prat", "Barcelona", "ES"),
    "LIRF": ("Rome Fiumicino", "Rome", "IT"), "LIMC": ("Milan Malpensa", "Milan", "IT"),
    "EHAM": ("Amsterdam Schiphol", "Amsterdam", "NL"), "EBBR": ("Brussels", "Brussels", "BE"),
    "LSZH": ("Zurich", "Zurich", "CH"), "LOWW": ("Vienna", "Vienna", "AT"),
    "EKCH": ("Copenhagen Kastrup", "Copenhagen", "DK"), "ENGM": ("Oslo Gardermoen", "Oslo", "NO"),
    "ESSA": ("Stockholm Arlanda", "Stockholm", "SE"), "EFHK": ("Helsinki Vantaa", "Helsinki", "FI"),
    "EIDW": ("Dublin", "Dublin", "IE"), "LPPT": ("Lisbon", "Lisbon", "PT"),
    "LTFM": ("Istanbul", "Istanbul", "TR"), "UUEE": ("Moscow Sheremetyevo", "Moscow", "RU"),
    "LGAV": ("Athens", "Athens", "GR"), "EPWA": ("Warsaw Chopin", "Warsaw", "PL"),
    "LKPR": ("Prague Vaclav Havel", "Prague", "CZ"), "LHBP": ("Budapest", "Budapest", "HU"),
    "OMDB": ("Dubai Intl", "Dubai", "AE"), "OTHH": ("Doha Hamad Intl", "Doha", "QA"),
    "OERK": ("Riyadh King Khalid", "Riyadh", "SA"), "OMAA": ("Abu Dhabi Intl", "Abu Dhabi", "AE"),
    "OJAI": ("Amman Queen Alia", "Amman", "JO"), "HECA": ("Cairo Intl", "Cairo", "EG"),
    "VABB": ("Mumbai Chhatrapati Shivaji", "Mumbai", "IN"), "VIDP": ("Delhi Indira Gandhi", "Delhi", "IN"),
    "VHHH": ("Hong Kong Intl", "Hong Kong", "HK"), "ZBAA": ("Beijing Capital", "Beijing", "CN"),
    "ZSPD": ("Shanghai Pudong", "Shanghai", "CN"), "ZGGG": ("Guangzhou Baiyun", "Guangzhou", "CN"),
    "RJTT": ("Tokyo Haneda", "Tokyo", "JP"), "RJAA": ("Tokyo Narita", "Tokyo", "JP"),
    "RKSI": ("Seoul Incheon", "Seoul", "KR"), "WSSS": ("Singapore Changi", "Singapore", "SG"),
    "WMKK": ("Kuala Lumpur Intl", "Kuala Lumpur", "MY"), "VTBS": ("Bangkok Suvarnabhumi", "Bangkok", "TH"),
    "RPLL": ("Manila Ninoy Aquino", "Manila", "PH"), "WIII": ("Jakarta Soekarno-Hatta", "Jakarta", "ID"),
    "YSSY": ("Sydney Kingsford Smith", "Sydney", "AU"), "YMML": ("Melbourne", "Melbourne", "AU"),
    "YBBN": ("Brisbane", "Brisbane", "AU"), "NZAA": ("Auckland", "Auckland", "NZ"),
    "SBGR": ("Sao Paulo Guarulhos", "Sao Paulo", "BR"), "SBGL": ("Rio de Janeiro Galeao", "Rio de Janeiro", "BR"),
    "SAEZ": ("Buenos Aires Ezeiza", "Buenos Aires", "AR"), "SCEL": ("Santiago", "Santiago", "CL"),
    "SKBO": ("Bogota El Dorado", "Bogota", "CO"), "MMMX": ("Mexico City Intl", "Mexico City", "MX"),
    "FAOR": ("Johannesburg O.R. Tambo", "Johannesburg", "ZA"), "HKJK": ("Nairobi Jomo Kenyatta", "Nairobi", "KE"),
    "DAAG": ("Algiers", "Algiers", "DZ"), "GMMN": ("Casablanca Mohammed V", "Casablanca", "MA"),
}


def describe_airport(code):
    if not code:
        return None
    entry = ICAO_AIRPORTS.get(code.upper())
    if not entry:
        return {"code": code, "name": code, "city": None, "country": None}
    name, city, country = entry
    return {"code": code, "name": name, "city": city, "country": country}
