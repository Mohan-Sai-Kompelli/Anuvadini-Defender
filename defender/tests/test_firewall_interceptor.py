"""Regression tests for the browser window/tab interceptor.

The bug these lock down: a DNS-over-HTTPS rule for chrome.cloudflare-dns.com used to
extract the first subdomain label ("chrome") and match every Chrome window title,
so the firewall closed Chrome on every launch.
"""

import os
import sys
import unittest

DEFENDER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if DEFENDER_DIR not in sys.path:
    sys.path.insert(0, DEFENDER_DIR)

from anuvadini_detector import firewall


class WindowInterceptorRegressionTests(unittest.TestCase):
    def setUp(self):
        firewall.AGENT_MODE = True  # use injected remote_rules, never the database
        self.fw = firewall.WorkplaceFirewall()
        self.fw.remote_enabled = True
        self.fw.remote_rules = []

    def _match(self, title, rules, process="chrome.exe"):
        self.fw.remote_rules = rules
        return self.fw._raw_check_window_interceptor(title, process, 123, 456)

    def test_chrome_title_does_not_match_chrome_dns_rule(self):
        rules = [{"domain": "chrome.cloudflare-dns.com", "category": "DNS-over-HTTPS Bypass", "enabled": 1}]
        for title in ("New Tab - Google Chrome", "Google Chrome", "Chrome - Settings"):
            self.assertIsNone(self._match(title, rules), title)

    def test_doh_category_is_never_title_matched(self):
        rules = [{"domain": "acmecorp.com", "category": "DNS-over-HTTPS Bypass", "enabled": 1}]
        self.assertIsNone(self._match("Acmecorp - Google Chrome", rules))

    def test_vendor_label_is_not_used_as_brand(self):
        rules = [{"domain": "google.com", "category": "Social Media", "enabled": 1}]
        self.assertIsNone(self._match("New Tab - Google Chrome", rules))

    def test_rule_brand_token_uses_registrable_label(self):
        self.assertEqual(firewall.rule_brand_token("chrome.cloudflare-dns.com"), "cloudflare-dns")
        self.assertEqual(firewall.rule_brand_token("www.pornhub.com"), "pornhub")
        self.assertEqual(firewall.rule_brand_token("store.steampowered.com"), "steampowered")
        self.assertEqual(firewall.rule_brand_token("x.com"), "x")

    def test_real_blocklist_rule_still_matches(self):
        rules = [{"domain": "acme-blocked-site.com", "category": "Gambling & Betting", "enabled": 1}]
        match = self._match("Acme-Blocked-Site - Google Chrome", rules)
        self.assertIsNotNone(match)
        self.assertEqual(match["domain"], "acme-blocked-site.com")

    def test_disabled_rule_is_ignored(self):
        rules = [{"domain": "acme-blocked-site.com", "category": "Gambling & Betting", "enabled": 0}]
        self.assertIsNone(self._match("Acme-Blocked-Site - Google Chrome", rules))


if __name__ == "__main__":
    unittest.main(verbosity=2)
