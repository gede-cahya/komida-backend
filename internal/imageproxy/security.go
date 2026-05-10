package imageproxy

import (
	"context"
	"errors"
	"net"
	"net/netip"
	"net/url"
	"strings"
)

var errBlockedTarget = errors.New("blocked target")

func validateImageURL(rawURL string, allowPrivateIPs bool, resolver *net.Resolver) (*url.URL, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return nil, err
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, errBlockedTarget
	}
	if parsed.User != nil || parsed.Host == "" {
		return nil, errBlockedTarget
	}
	host := parsed.Hostname()
	if host == "" || strings.EqualFold(host, "localhost") {
		return nil, errBlockedTarget
	}
	if ip, err := netip.ParseAddr(host); err == nil {
		if !allowPrivateIPs && isBlockedIP(ip) {
			return nil, errBlockedTarget
		}
		return parsed, nil
	}
	ips, err := resolver.LookupNetIP(context.Background(), "ip", host)
	if err != nil {
		return nil, err
	}
	if len(ips) == 0 {
		return nil, errBlockedTarget
	}
	if !allowPrivateIPs {
		for _, ip := range ips {
			if isBlockedIP(ip) {
				return nil, errBlockedTarget
			}
		}
	}
	return parsed, nil
}

func isBlockedIP(ip netip.Addr) bool {
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified()
}
