using Booking.Application.Common.Interfaces;

namespace Booking.Infrastructure.Common;

public sealed class DateTimeProvider : IDateTimeProvider
{
    public DateTime UtcNow => DateTime.UtcNow;
}
