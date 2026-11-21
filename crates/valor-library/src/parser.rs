use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ParsedFilename {
    pub title: String,
    pub year: Option<u32>,
    pub season: Option<u32>,
    pub episode: Option<u32>,
    pub episode_end: Option<u32>,
    pub resolution: Option<String>,
    pub source: Option<String>,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub release_group: Option<String>,
}

pub fn parse_media_filename(file_path: &str) -> ParsedFilename {
    let filename = Path::new(file_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(file_path);

    // 1. Extract Release Group if at end (e.g. "-Spidey", "-FLUX", "-SPHD")
    let (clean_without_group, release_group) = extract_release_group(filename);

    // 2. Extract Anime Group and Episode if formatted like "[SubsPlease] Title - 05 (1080p)"
    if clean_without_group.starts_with('[') {
        if let Some(parsed) = parse_anime_format(&clean_without_group, release_group.as_deref()) {
            return parsed;
        }
    }

    // 3. Normalize dots and underscores to spaces for standard tokenization
    let clean = clean_without_group.replace(['.', '_'], " ");

    // 4. Extract resolution, source, codecs
    let resolution = extract_resolution(&clean);
    let source = extract_source(&clean);
    let video_codec = extract_video_codec(&clean);
    let audio_codec = extract_audio_codec(&clean);

    // 5. Check for TV episode: S01E02, S01E02-E03, S01E02E03, 1x02
    let re_tv =
        Regex::new(r"(?i)\b(?:s(\d{1,2})e(\d{1,3})(?:[-_eE](\d{1,3}))?|(\d{1,2})x(\d{1,3}))\b")
            .unwrap();

    if let Some(caps) = re_tv.captures(&clean) {
        let match_start = caps.get(0).unwrap().start();
        let raw_title = clean[..match_start].trim();

        let season = caps
            .get(1)
            .or_else(|| caps.get(4))
            .and_then(|m| m.as_str().parse().ok());
        let episode = caps
            .get(2)
            .or_else(|| caps.get(5))
            .and_then(|m| m.as_str().parse().ok());
        let episode_end = caps.get(3).and_then(|m| m.as_str().parse().ok());

        let (title, year) = extract_year_from_title(raw_title);

        return ParsedFilename {
            title: clean_title_str(&title, filename),
            year,
            season,
            episode,
            episode_end,
            resolution,
            source,
            video_codec,
            audio_codec,
            release_group,
        };
    }

    // 6. Check for Season folder / Episode standalone: "Episode 05" or "Ep 05"
    let re_ep_standalone = Regex::new(r"(?i)\b(?:episode|ep)\s*(\d{1,3})\b").unwrap();
    if let Some(caps) = re_ep_standalone.captures(&clean) {
        let match_start = caps.get(0).unwrap().start();
        let raw_title = clean[..match_start].trim();
        let episode = caps.get(1).and_then(|m| m.as_str().parse().ok());
        let (title, year) = extract_year_from_title(raw_title);

        return ParsedFilename {
            title: clean_title_str(&title, filename),
            year,
            season: Some(1),
            episode,
            episode_end: None,
            resolution,
            source,
            video_codec,
            audio_codec,
            release_group,
        };
    }

    // 7. Otherwise Movie / Single media item
    let (title, year) = extract_year_from_title(&clean);

    ParsedFilename {
        title: clean_title_str(&title, filename),
        year,
        season: None,
        episode: None,
        episode_end: None,
        resolution,
        source,
        video_codec,
        audio_codec,
        release_group,
    }
}

fn extract_release_group(input: &str) -> (String, Option<String>) {
    if let Some(pos) = input.rfind('-') {
        let suffix = &input[pos + 1..];
        if !suffix.is_empty()
            && suffix.len() <= 16
            && !suffix.contains(' ')
            && !suffix.eq_ignore_ascii_case("mkv")
            && !suffix.eq_ignore_ascii_case("mp4")
            && !suffix.chars().all(|c| c.is_ascii_digit())
        {
            return (input[..pos].to_string(), Some(suffix.to_string()));
        }
    }
    (input.to_string(), None)
}

fn parse_anime_format(input: &str, release_group: Option<&str>) -> Option<ParsedFilename> {
    // Matches: "[Group] Title - 05 (1080p)" or "[Group] Title - Episode 05"
    let re_anime = Regex::new(r"^\[(.*?)\]\s*(.*?)\s*-\s*(\d{1,4})(?:v\d+)?\b").ok()?;
    if let Some(caps) = re_anime.captures(input) {
        let group = caps.get(1).map(|m| m.as_str().to_string());
        let raw_title = caps.get(2).map(|m| m.as_str().trim()).unwrap_or("");
        let episode = caps.get(3).and_then(|m| m.as_str().parse().ok());

        let clean_for_tags = input.replace(['.', '_'], " ");
        return Some(ParsedFilename {
            title: raw_title.to_string(),
            year: None,
            season: Some(1),
            episode,
            episode_end: None,
            resolution: extract_resolution(&clean_for_tags),
            source: extract_source(&clean_for_tags),
            video_codec: extract_video_codec(&clean_for_tags),
            audio_codec: extract_audio_codec(&clean_for_tags),
            release_group: group.or_else(|| release_group.map(|s| s.to_string())),
        });
    }
    None
}

fn extract_year_from_title(input: &str) -> (String, Option<u32>) {
    // 1. First look for parenthesized / bracketed year: (2017) or [2017]
    let re_paren_year = Regex::new(r"[\(\[]\s*(19\d{2}|20\d{2})\s*[\)\]]").unwrap();
    if let Some(caps) = re_paren_year.captures(input) {
        if let Some(m) = caps.get(1) {
            let year = m.as_str().parse().ok();
            let entire_match = caps.get(0).unwrap();
            let title = input[..entire_match.start()]
                .trim()
                .trim_end_matches(['(', '[', '-', ' '])
                .trim()
                .to_string();
            return (title, year);
        }
    }

    // 2. Otherwise look for standalone year (prefer not at index 0)
    let re_year = Regex::new(r"\b(19\d{2}|20\d{2})\b").unwrap();
    for caps in re_year.captures_iter(input) {
        if let Some(m) = caps.get(1) {
            if m.start() > 0 {
                let year = m.as_str().parse().ok();
                let title = input[..m.start()]
                    .trim()
                    .trim_end_matches(['(', '[', '-', ' '])
                    .trim()
                    .to_string();
                if !title.is_empty() {
                    return (title, year);
                }
            }
        }
    }
    (input.trim().to_string(), None)
}

fn clean_title_str(title: &str, fallback: &str) -> String {
    let t = title.trim();
    if t.is_empty() {
        fallback.to_string()
    } else {
        // Strip common trailing metadata words if leaked into title
        let re_strip = Regex::new(
            r"(?i)\b(2160p|1080p|720p|480p|uhd|bluray|web-dl|webrip|hdtv|hevc|x265|x264|h\.264|h\.265)\b.*",
        )
        .unwrap();
        re_strip.replace(t, "").trim().to_string()
    }
}

fn extract_resolution(input: &str) -> Option<String> {
    let re = Regex::new(r"(?i)\b(2160p|4k|1080p|720p|480p|576p)\b").unwrap();
    re.captures(input)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_uppercase())
}

fn extract_source(input: &str) -> Option<String> {
    let re =
        Regex::new(r"(?i)\b(BluRay|BDRip|BRRip|WEB-DL|WEBRip|HDTV|DVDRip|DVD|Remux)\b").unwrap();
    re.captures(input)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
}

fn extract_video_codec(input: &str) -> Option<String> {
    let re = Regex::new(r"(?i)\b(HEVC|H\.265|x265|H\.264|x264|AVC|AV1|XviD|DivX)\b").unwrap();
    re.captures(input)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_uppercase())
}

fn extract_audio_codec(input: &str) -> Option<String> {
    let re =
        Regex::new(r"(?i)\b(TrueHD|Atmos|DTS-HD|DTS-X|DTS|DDP5\.1|DD5\.1|AC3|AAC|FLAC)\b").unwrap();
    re.captures(input)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_100_filename_release_patterns() {
        let patterns = vec![
            // 1-10: Standard Scene TV Releases
            ("MobLand.2025.S02E09.Nervous.Breakdown.2160p.ATV.WEB-DL.DUAL.DD5.1.H.265-Spidey.mkv", "MobLand", Some(2025), Some(2), Some(9)),
            ("Breaking.Bad.S05E14.720p.HDTV.x264-ASAP.mkv", "Breaking Bad", None, Some(5), Some(14)),
            ("Game.of.Thrones.S08E03.1080p.AMZN.WEB-DL.DDP5.1.H.264-GoT.mkv", "Game of Thrones", None, Some(8), Some(3)),
            ("Stranger.Things.S04E01.Chapter.One.The.Hellfire.Club.2160p.NF.WEB-DL.DDP5.1.Atmos.DV.HEVC-FLUX.mkv", "Stranger Things", None, Some(4), Some(1)),
            ("The.Last.of.Us.S01E09.Look.for.the.Light.1080p.MAX.WEB-DL.DDP5.1.Atmos.H.264-SMURF.mkv", "The Last of Us", None, Some(1), Some(9)),
            ("Severance.S01E01.Good.News.About.Hell.1080p.ATVP.WEB-DL.DDP5.1.Atmos.H.264-FLUX.mkv", "Severance", None, Some(1), Some(1)),
            ("Succession.S04E03.Connor's.Wedding.1080p.AMZN.WEB-DL.DDP5.1.H.264-NTb.mkv", "Succession", None, Some(4), Some(3)),
            ("The.Bear.S02E06.Fishes.1080p.HULU.WEB-DL.DDP5.1.H.264-FLUX.mkv", "The Bear", None, Some(2), Some(6)),
            ("Better.Call.Saul.S06E13.Saul.Gone.1080p.AMZN.WEB-DL.DDP5.1.H.264-NTb.mkv", "Better Call Saul", None, Some(6), Some(13)),
            ("Fargo.S05E10.Bisquik.1080p.HULU.WEB-DL.DDP5.1.H.264-FLUX.mkv", "Fargo", None, Some(5), Some(10)),

            // 11-20: Movies with Year and Resolution
            ("In The Grey (2026) 2160p 10bit UHD BluRay HDR10 x265 HEVC [Hindi AMZN DDP 5.1 + English TrueHD Atmos 7.1] ESub  TDP  SPHD.mkv", "In The Grey", Some(2026), None, None),
            ("Oppenheimer.2023.2160p.UHD.BluRay.x265.10bit.HDR.TrueHD.7.1.Atmos-SPARKS.mkv", "Oppenheimer", Some(2023), None, None),
            ("Dune.Part.Two.2024.2160p.MA.WEB-DL.DDP5.1.Atmos.DV.HDR10.H.265-FLUX.mkv", "Dune Part Two", Some(2024), None, None),
            ("Interstellar (2014) 1080p BluRay x264 DTS-WiKi.mkv", "Interstellar", Some(2014), None, None),
            ("Blade Runner 2049 (2017) 2160p UHD HDR TrueHD Atmos.mkv", "Blade Runner 2049", Some(2017), None, None),
            ("The.Batman.2022.1080p.WEBRip.x264.AAC5.1-[YTS.MX].mp4", "The Batman", Some(2022), None, None),
            ("Everything.Everywhere.All.at.Once.2022.1080p.BluRay.x264-ROVERS.mkv", "Everything Everywhere All at Once", Some(2022), None, None),
            ("Parasite.2019.KOREAN.1080p.BluRay.x264.DTS-HD.MA.5.1-FGT.mkv", "Parasite", Some(2019), None, None),
            ("Spider-Man.Across.the.Spider-Verse.2023.1080p.WEB-DL.DDP5.1.Atmos.H.264-FLUX.mkv", "Spider-Man Across the Spider-Verse", Some(2023), None, None),
            ("Top.Gun.Maverick.2022.2160p.UHD.BluRay.x265-TERMINAL.mkv", "Top Gun Maverick", Some(2022), None, None),

            // 21-30: Anime releases with [Group]
            ("[SubsPlease] Frieren - Beyond Journey's End - 05 (1080p) [ABCD1234].mkv", "Frieren - Beyond Journey's End", None, Some(1), Some(5)),
            ("[Erai-raws] Jujutsu Kaisen 2nd Season - 16 [1080p][Multiple Subtitle].mkv", "Jujutsu Kaisen 2nd Season", None, Some(1), Some(16)),
            ("[SubsPlease] Solo Leveling - 08 (1080p) [EF123456].mkv", "Solo Leveling", None, Some(1), Some(8)),
            ("[ASW] Demon Slayer Kimetsu no Yaiba - 19 [1080p].mkv", "Demon Slayer Kimetsu no Yaiba", None, Some(1), Some(19)),
            ("[HorribleSubs] Attack on Titan - 54 [1080p].mkv", "Attack on Titan", None, Some(1), Some(54)),
            ("[Erai-raws] Chainsaw Man - 12 [1080p].mkv", "Chainsaw Man", None, Some(1), Some(12)),
            ("[SubsPlease] Spy x Family - 25 (1080p).mkv", "Spy x Family", None, Some(1), Some(25)),
            ("[SubsPlease] Oshi no Ko - 01 (1080p).mkv", "Oshi no Ko", None, Some(1), Some(1)),
            ("[Erai-raws] Vinland Saga Season 2 - 24 [1080p].mkv", "Vinland Saga Season 2", None, Some(1), Some(24)),
            ("[SubsPlease] Cyberpunk Edgerunners - 10 (1080p).mkv", "Cyberpunk Edgerunners", None, Some(1), Some(10)),

            // 31-40: Multi-episode and alternative numbering
            ("Devs.S01E06.1080p.WEB-DL.x265.6CH-Pahe.in.mkv", "Devs", None, Some(1), Some(6)),
            ("Friends.1x01.The.One.Where.Monica.Gets.a.Roommate.720p.mkv", "Friends", None, Some(1), Some(1)),
            ("The.Office.US.02x01.The.Dundies.1080p.mkv", "The Office US", None, Some(2), Some(1)),
            ("Lost.S01E01-E02.Pilot.720p.BluRay.x264-SiNNERS.mkv", "Lost", None, Some(1), Some(1)),
            ("Doctor.Who.2005.S04E08.Silence.in.the.Library.1080p.mkv", "Doctor Who", Some(2005), Some(4), Some(8)),
            ("Sherlock.S02E01.A.Scandal.in.Belgravia.1080p.mkv", "Sherlock", None, Some(2), Some(1)),
            ("Chernobyl.S01E05.Vichnaya.Pamyat.1080p.mkv", "Chernobyl", None, Some(1), Some(5)),
            ("True.Detective.S01E04.Who.Goes.There.1080p.mkv", "True Detective", None, Some(1), Some(4)),
            ("Band.of.Brothers.S01E09.Why.We.Fight.1080p.mkv", "Band of Brothers", None, Some(1), Some(9)),
            ("Arcane.S01E09.The.Monster.You.Created.2160p.mkv", "Arcane", None, Some(1), Some(9)),

            // 41-50: More Movies across various eras
            ("The.Godfather.1972.50th.Anniversary.2160p.UHD.BluRay.x265-TERMINAL.mkv", "The Godfather", Some(1972), None, None),
            ("Pulp.Fiction.1994.1080p.BluRay.x264-CiNEFiLE.mkv", "Pulp Fiction", Some(1994), None, None),
            ("The.Matrix.1999.2160p.UHD.BluRay.x265-TERMiNAL.mkv", "The Matrix", Some(1999), None, None),
            ("Fight.Club.1999.1080p.BluRay.x264-CtrlHD.mkv", "Fight Club", Some(1999), None, None),
            ("The.Dark.Knight.2008.1080p.BluRay.x264-DELiCiOUS.mkv", "The Dark Knight", Some(2008), None, None),
            ("Inception.2010.1080p.BluRay.x264-CROSSFiRE.mkv", "Inception", Some(2010), None, None),
            ("Spirited.Away.2001.1080p.BluRay.x264-THORA.mkv", "Spirited Away", Some(2001), None, None),
            ("Mad.Max.Fury.Road.2015.2160p.UHD.BluRay.x265-SPARKS.mkv", "Mad Max Fury Road", Some(2015), None, None),
            ("Arrival.2016.1080p.BluRay.x264-SPARKS.mkv", "Arrival", Some(2016), None, None),
            ("Whiplash.2014.1080p.BluRay.x264-SPARKS.mkv", "Whiplash", Some(2014), None, None),

            // 51-60: Web and TV episodes
            ("House.of.the.Dragon.S02E04.The.Red.Dragon.and.the.Gold.2160p.mkv", "House of the Dragon", None, Some(2), Some(4)),
            ("Loki.S02E06.Glorious.Purpose.2160p.DSNP.WEB-DL.mkv", "Loki", None, Some(2), Some(6)),
            ("Andor.S01E10.One.Way.Out.2160p.DSNP.WEB-DL.mkv", "Andor", None, Some(1), Some(10)),
            ("The.Mandalorian.S02E08.The.Rescue.2160p.DSNP.WEB-DL.mkv", "The Mandalorian", None, Some(2), Some(8)),
            ("Yellowstone.2018.S05E08.A.Knife.and.No.Coin.1080p.mkv", "Yellowstone", Some(2018), Some(5), Some(8)),
            ("The.White.Lotus.S02E07.Arrivederci.1080p.mkv", "The White Lotus", None, Some(2), Some(7)),
            ("Ted.Lasso.S03E12.So.Long.Farewell.1080p.mkv", "Ted Lasso", None, Some(3), Some(12)),
            ("Barry.S04E08.wow.1080p.mkv", "Barry", None, Some(4), Some(8)),
            ("Peaky.Blinders.S06E06.Lock.and.Key.1080p.mkv", "Peaky Blinders", None, Some(6), Some(6)),
            ("The.Crown.S06E10.Sleep.Dearie.Sleep.1080p.mkv", "The Crown", None, Some(6), Some(10)),

            // 61-70: Classic and Modern Cinema
            ("2001.A.Space.Odyssey.1968.2160p.UHD.BluRay.x265.mkv", "2001 A Space Odyssey", Some(1968), None, None),
            ("Apocalypse.Now.1979.Final.Cut.2160p.UHD.BluRay.x265.mkv", "Apocalypse Now", Some(1979), None, None),
            ("Alien.1979.Director's.Cut.1080p.BluRay.x264.mkv", "Alien", Some(1979), None, None),
            ("The.Shining.1980.2160p.UHD.BluRay.x265.mkv", "The Shining", Some(1980), None, None),
            ("Blade.Runner.1982.Final.Cut.1080p.BluRay.x264.mkv", "Blade Runner", Some(1982), None, None),
            ("GoodFellas.1990.1080p.BluRay.x264.mkv", "GoodFellas", Some(1990), None, None),
            ("Schindler's.List.1993.2160p.UHD.BluRay.x265.mkv", "Schindler's List", Some(1993), None, None),
            ("The.Shawshank.Redemption.1994.1080p.BluRay.x264.mkv", "The Shawshank Redemption", Some(1994), None, None),
            ("Se7en.1995.1080p.BluRay.x264.mkv", "Se7en", Some(1995), None, None),
            ("Saving.Private.Ryan.1998.2160p.UHD.BluRay.x265.mkv", "Saving Private Ryan", Some(1998), None, None),

            // 71-80: 2000s - 2020s Blockbusters
            ("Gladiator.2000.2160p.UHD.BluRay.x265.mkv", "Gladiator", Some(2000), None, None),
            ("Memento.2000.1080p.BluRay.x264.mkv", "Memento", Some(2000), None, None),
            ("The.Lord.of.the.Rings.The.Fellowship.of.the.Ring.2001.Extended.2160p.mkv", "The Lord of the Rings The Fellowship of the Ring", Some(2001), None, None),
            ("The.Departed.2006.1080p.BluRay.x264.mkv", "The Departed", Some(2006), None, None),
            ("No.Country.for.Old.Men.2007.1080p.BluRay.x264.mkv", "No Country for Old Men", Some(2007), None, None),
            ("There.Will.Be.Blood.2007.1080p.BluRay.x264.mkv", "There Will Be Blood", Some(2007), None, None),
            ("WALL-E.2008.1080p.BluRay.x264.mkv", "WALL-E", Some(2008), None, None),
            ("Inglourious.Basterds.2009.1080p.BluRay.x264.mkv", "Inglourious Basterds", Some(2009), None, None),
            ("The.Social.Network.2010.1080p.BluRay.x264.mkv", "The Social Network", Some(2010), None, None),
            ("Drive.2011.1080p.BluRay.x264.mkv", "Drive", Some(2011), None, None),

            // 81-90: Modern Streaming TV Shows
            ("Fallout.S01E01.The.End.2160p.AMZN.WEB-DL.mkv", "Fallout", None, Some(1), Some(1)),
            ("Shogun.2024.S01E09.Crimson.Sky.1080p.HULU.WEB-DL.mkv", "Shogun", Some(2024), Some(1), Some(9)),
            ("Dark.S03E08.The.Paradise.1080p.NF.WEB-DL.mkv", "Dark", None, Some(3), Some(8)),
            ("Mindhunter.S02E09.1080p.NF.WEB-DL.mkv", "Mindhunter", None, Some(2), Some(9)),
            ("BoJack.Horseman.S06E15.The.View.from.Halfway.Down.1080p.mkv", "BoJack Horseman", None, Some(6), Some(15)),
            ("Fleabag.S02E01.Episode.1.1080p.AMZN.WEB-DL.mkv", "Fleabag", None, Some(2), Some(1)),
            ("Mr.Robot.S04E07.407.Proxy.Authentication.Required.1080p.mkv", "Mr Robot", None, Some(4), Some(7)),
            ("Atlanta.S02E06.Teddy.Perkins.1080p.FX.WEB-DL.mkv", "Atlanta", None, Some(2), Some(6)),
            ("Twin.Peaks.S03E08.Part.8.Gotta.Light.1080p.mkv", "Twin Peaks", None, Some(3), Some(8)),
            ("The.Wire.S04E13.Final.Grades.720p.HDTV.mkv", "The Wire", None, Some(4), Some(13)),

            // 91-100: Miscellaneous formats & edge cases
            ("Sample Video 2026.mp4", "Sample Video", Some(2026), None, None),
            ("Documentary.Special.Episode 01.1080p.mkv", "Documentary Special", None, Some(1), Some(1)),
            ("The.Sopranos.S05E12.Long.Term.Parking.1080p.mkv", "The Sopranos", None, Some(5), Some(12)),
            ("Westworld.S01E10.The.Bicameral.Mind.1080p.mkv", "Westworld", None, Some(1), Some(10)),
            ("Black.Mirror.S03E04.San.Junipero.1080p.mkv", "Black Mirror", None, Some(3), Some(4)),
            ("Rick.and.Morty.S03E07.The.Ricklantis.Mixup.1080p.mkv", "Rick and Morty", None, Some(3), Some(7)),
            ("South.Park.S08E01.Good.Times.with.Weapons.1080p.mkv", "South Park", None, Some(8), Some(1)),
            ("It's.Always.Sunny.in.Philadelphia.S04E13.The.Nightman.Cometh.720p.mkv", "It's Always Sunny in Philadelphia", None, Some(4), Some(13)),
            ("Community.S02E14.Advanced.Dungeons.and.Dragons.720p.mkv", "Community", None, Some(2), Some(14)),
            ("Parks.and.Recreation.S03E09.Andy.and.April's.Fancy.Party.720p.mkv", "Parks and Recreation", None, Some(3), Some(9)),
        ];

        let mut pass_count = 0;
        for (input, exp_title, exp_year, exp_season, exp_episode) in patterns {
            let parsed = parse_media_filename(input);
            assert_eq!(
                parsed.title, exp_title,
                "Title mismatch for '{}': got '{}', expected '{}'",
                input, parsed.title, exp_title
            );
            assert_eq!(
                parsed.year, exp_year,
                "Year mismatch for '{}': got '{:?}', expected '{:?}'",
                input, parsed.year, exp_year
            );
            assert_eq!(
                parsed.season, exp_season,
                "Season mismatch for '{}': got '{:?}', expected '{:?}'",
                input, parsed.season, exp_season
            );
            assert_eq!(
                parsed.episode, exp_episode,
                "Episode mismatch for '{}': got '{:?}', expected '{:?}'",
                input, parsed.episode, exp_episode
            );
            pass_count += 1;
        }

        assert_eq!(
            pass_count, 100,
            "All 100 real-world filename patterns passed!"
        );
    }
}
