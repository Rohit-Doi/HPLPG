from hplpga import taxonomy as T


def test_channel_grouping_matches_ga4_defaults():
    assert T.channel_group("(direct)", "(none)") == "Direct"
    assert T.channel_group("google", "organic") == "Organic Search"
    assert T.channel_group("google", "cpc") == "Paid Search"
    assert T.channel_group("Facebook", "PaidSocial") == "Paid Social"
    assert T.channel_group("l.instagram.com", "referral") == "Organic Social"
    assert T.channel_group("Klaviyo", "campaign") == "Email"
    assert T.channel_group("chatgpt.com", "referral") == "AI Assistant"
    assert T.channel_group("shareasale-analytics.com", "referral") == "Affiliate"


def test_referrer_and_geo():
    assert T.channel_from_referrer("https://www.google.com/search?q=x") == ("google", "organic")
    assert T.channel_from_referrer(None) == ("(direct)", "(none)")
    assert T.macro_region("United States", "Texas") == "US South"
    assert T.macro_region("India", None) == "International"
    assert T.daypart(21) == "evening" and T.daypart(2) == "night"
    assert T.device_from_user_agent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile") == "mobile"
