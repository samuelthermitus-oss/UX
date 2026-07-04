"""ICAO 3-letter airline designator lookup (ICAO Doc 8585 - public reference data).

Used to turn a flight's callsign (e.g. "DLH441") into a readable airline
brand name (e.g. "Lufthansa") for display. Not exhaustive - covers major
and regional carriers likely to show up in OpenSky state vectors. Falls
back to "Unknown / private" when the prefix isn't recognized or the
callsign looks like a private registration (e.g. "N12345", "D-ABCD").
"""
import re

ICAO_AIRLINES = {
    "AAL": "American Airlines", "DAL": "Delta Air Lines", "UAL": "United Airlines",
    "SWA": "Southwest Airlines", "JBU": "JetBlue Airways", "ASA": "Alaska Airlines",
    "FFT": "Frontier Airlines", "NKS": "Spirit Airlines", "SKW": "SkyWest Airlines",
    "RPA": "Republic Airways", "ENY": "Envoy Air", "PDT": "Piedmont Airlines",
    "ACA": "Air Canada", "WJA": "WestJet", "TSC": "Air Transat", "POE": "Porter Airlines",
    "BAW": "British Airways", "VIR": "Virgin Atlantic", "EZY": "easyJet", "RYR": "Ryanair",
    "EXS": "Jet2", "TOM": "TUI Airways", "SHT": "SHINE (British Airways)",
    "DLH": "Lufthansa", "CFG": "Condor", "GEC": "Lufthansa Cargo", "EWG": "Eurowings",
    "AFR": "Air France", "FHY": "Freebird Airlines", "TVF": "Transavia France",
    "KLM": "KLM Royal Dutch Airlines", "TRA": "Transavia",
    "IBE": "Iberia", "VLG": "Vueling", "ANE": "Air Nostrum",
    "ITY": "ITA Airways", "AZA": "Alitalia", "NOS": "Neos",
    "SWR": "Swiss International Air Lines", "EDW": "Edelweiss Air",
    "AUA": "Austrian Airlines", "BEL": "Brussels Airlines", "TAP": "TAP Air Portugal",
    "SAS": "Scandinavian Airlines", "NAX": "Norwegian Air Shuttle", "FIN": "Finnair",
    "WZZ": "Wizz Air", "AEE": "Aegean Airlines", "PGT": "Pegasus Airlines",
    "THY": "Turkish Airlines", "UAE": "Emirates", "QTR": "Qatar Airways",
    "ETD": "Etihad Airways", "SVA": "Saudia", "GFA": "Gulf Air", "KAC": "Kuwait Airways",
    "MSR": "EgyptAir", "RJA": "Royal Jordanian", "MEA": "Middle East Airlines",
    "AIC": "Air India", "IGO": "IndiGo", "SEJ": "Spicejet",
    "CPA": "Cathay Pacific", "CES": "China Eastern Airlines", "CSN": "China Southern Airlines",
    "CCA": "Air China", "CHH": "Hainan Airlines", "CXA": "Xiamen Airlines",
    "JAL": "Japan Airlines", "ANA": "All Nippon Airways", "APJ": "Peach Aviation",
    "KAL": "Korean Air", "AAR": "Asiana Airlines",
    "SIA": "Singapore Airlines", "MAS": "Malaysia Airlines", "AXM": "AirAsia",
    "THA": "Thai Airways International", "PAL": "Philippine Airlines",
    "GIA": "Garuda Indonesia", "CTV": "Batik Air",
    "QFA": "Qantas", "JST": "Jetstar Airways", "VOZ": "Virgin Australia",
    "ANZ": "Air New Zealand",
    "LAN": "LATAM Airlines Chile", "TAM": "LATAM Airlines Brasil", "ARG": "Aerolineas Argentinas",
    "AVA": "Avianca", "CMP": "Copa Airlines", "AMX": "Aeromexico", "VOI": "Volaris",
    "GLO": "Gol Linhas Aereas", "AZU": "Azul Brazilian Airlines",
    "ETH": "Ethiopian Airlines", "SAA": "South African Airways", "KQA": "Kenya Airways",
    "RAM": "Royal Air Maroc", "DAH": "Air Algerie", "TAR": "Tunisair",
    "UPS": "UPS Airlines", "FDX": "FedEx Express", "GTI": "Atlas Air", "CLX": "Cargolux",
    "BOX": "AeroLogic", "ABW": "Air Bridge Cargo",
    "DHK": "DHL Air",
}


def airline_for_callsign(callsign):
    if not callsign:
        return None
    cs = callsign.strip().upper()
    match = re.match(r"^([A-Z]{3})\d", cs)
    if not match:
        return None
    return ICAO_AIRLINES.get(match.group(1))
