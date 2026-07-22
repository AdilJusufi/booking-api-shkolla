using Booking.Infrastructure.Common;
using FluentAssertions;
using Xunit;

namespace Booking.Tests.Unit.Infrastructure;

public class TimeZoneServiceTests
{
    private readonly TimeZoneService _service = new();

    [Fact]
    public void ToUtc_SummerTime_PrishtinaIsUtcPlus2()
    {
        var localJuly = new DateTime(2026, 7, 10, 12, 0, 0);

        _service.ToUtc(localJuly).Should().Be(new DateTime(2026, 7, 10, 10, 0, 0, DateTimeKind.Utc));
    }

    [Fact]
    public void ToUtc_WinterTime_PrishtinaIsUtcPlus1()
    {
        var localJanuary = new DateTime(2026, 1, 10, 12, 0, 0);

        _service.ToUtc(localJanuary).Should().Be(new DateTime(2026, 1, 10, 11, 0, 0, DateTimeKind.Utc));
    }

    [Fact]
    public void ToLocal_RoundTrip_ReturnsOriginal()
    {
        var local = new DateTime(2026, 8, 17, 9, 30, 0);

        _service.ToLocal(_service.ToUtc(local)).Should().Be(local);
    }

    [Fact]
    public void ToLocalDate_LateEveningUtc_MovesToNextLocalDay()
    {
        // 23:30 UTC në verë = 01:30 lokale të ditës së nesërme.
        var utc = new DateTime(2026, 7, 10, 23, 30, 0, DateTimeKind.Utc);

        _service.ToLocalDate(utc).Should().Be(new DateOnly(2026, 7, 11));
    }
}
