using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Booking.Infrastructure.Persistence;

/// <summary>
/// Përdoret VETËM nga dotnet-ef në design time (migrations) — jo nga aplikacioni.
/// Connection string-u merret nga env var BOOKING_CONNECTION ose bie te vlera lokale e development-it.
/// </summary>
public class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<BookingDbContext>
{
    public BookingDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("BOOKING_CONNECTION")
            ?? "Host=localhost;Port=5432;Database=booking_dev;Username=postgres;Password=postgres";

        var options = new DbContextOptionsBuilder<BookingDbContext>()
            .UseNpgsql(connectionString)
            .Options;

        return new BookingDbContext(options);
    }
}
