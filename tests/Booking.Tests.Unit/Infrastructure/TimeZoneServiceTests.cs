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

    [Theory]
    // Ndërrimi i orës në fund të tetorit 2026 (25 Tet, 03:00 CEST → 02:00 CET).
    [InlineData(2026, 10, 24, 9, 7)]   // ende verë (+2)
    [InlineData(2026, 10, 26, 9, 8)]   // dimër (+1)
    [InlineData(2026, 10, 30, 9, 8)]   // dita e mungesës nga WR-03
    [InlineData(2026, 10, 30, 17, 16)]
    public void ToUtc_AroundLateOctoberDstChange_UsesTheOffsetOfThatDay(int y, int m, int d, int localHour, int utcHour)
    {
        _service.ToUtc(new DateTime(y, m, d, localHour, 0, 0))
            .Should().Be(new DateTime(y, m, d, utcHour, 0, 0, DateTimeKind.Utc));
    }

    [Fact]
    public void ToUtc_ValueAlreadyUtc_IsTreatedAsAnInstant_NotAsLocalTime()
    {
        // WR-03: shfletuesi dërgonte "2026-10-30T08:00:00Z" për 09:00 lokale; kjo vlerë
        // riinterpretohej si 08:00 lokale dhe ruhej 07:00 UTC — një orë më herët.
        var instant = new DateTime(2026, 10, 30, 8, 0, 0, DateTimeKind.Utc);

        _service.ToUtc(instant).Should().Be(instant);
        _service.ToLocal(_service.ToUtc(instant)).Should().Be(new DateTime(2026, 10, 30, 9, 0, 0));
    }

    [Fact]
    public void ToUtc_ValueWithServerLocalKind_IsConvertedAsAnInstant()
    {
        var instant = new DateTime(2026, 7, 10, 10, 0, 0, DateTimeKind.Utc);
        var asServerLocal = instant.ToLocalTime();

        _service.ToUtc(asServerLocal).Should().Be(instant);
    }

    [Fact]
    public void ToLocal_ReturnsUnspecifiedKind_SoJsonCarriesNoOffset()
    {
        _service.ToLocal(new DateTime(2026, 1, 10, 11, 0, 0, DateTimeKind.Utc)).Kind.Should().Be(DateTimeKind.Unspecified);
    }
}
