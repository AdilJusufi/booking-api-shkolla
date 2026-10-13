using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Booking.Infrastructure.Persistence.Configurations;

public class BackgroundJobStateConfiguration : IEntityTypeConfiguration<BackgroundJobState>
{
    public void Configure(EntityTypeBuilder<BackgroundJobState> builder)
    {
        builder.HasKey(s => s.Name);
        builder.Property(s => s.Name).HasMaxLength(100);
    }
}
